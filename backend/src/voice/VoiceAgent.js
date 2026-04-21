/**
 * VoiceAgent - Handles phone calls with OpenAI Realtime API
 * 
 * Responsibilities:
 * - Receive incoming calls via Twilio webhooks
 * - Stream audio bidirectionally: Twilio ←→ OpenAI
 * - Capture transcripts in real-time
 * - Emit Socket.io events for mobile app (live transcript, call status)
 * - Return call results when complete
 */

import WebSocket from 'ws';
import twilio from 'twilio';
import { EventEmitter } from 'events';

class VoiceAgent extends EventEmitter {
  constructor(config, socketIO = null) {
    super();
    
    this.config = config;
    this.io = socketIO; // Socket.io instance for mobile app events
    this.activeCalls = new Map();
    
    // OpenAI Realtime API configuration
    this.azureEndpoint = config.OPENAI_ENDPOINT;
    this.azureApiKey = config.OPENAI_API_KEY;
    this.deploymentName = config.OPENAI_DEPLOYMENT_NAME || 'gpt-realtime-mini';
    
    // Twilio configuration
    this.twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    this.twilioPhoneNumber = config.TWILIO_PHONE_NUMBER;
    this.webhookUrl = config.WEBHOOK_URL;
    
    // Voice settings
    this.voiceConfig = {
      voice: 'shimmer',  // Options: alloy, echo, shimmer
      inputAudioFormat: 'g711_ulaw',  // Twilio phone audio format
      outputAudioFormat: 'g711_ulaw',
      temperature: 0.7,
      maxResponseTokens: 4096
    };

    console.log('✅ VoiceAgent initialized');
    console.log(`   Azure Endpoint: ${this.azureEndpoint}`);
    console.log(`   Twilio Number: ${this.twilioPhoneNumber}`);
  }

  /**
   * Generate TwiML response for incoming call
   * Tells Twilio to connect the call to our WebSocket stream
   */
  generateIncomingCallTwiML(req) {
    const response = new twilio.twiml.VoiceResponse();
    
    // Connect to our WebSocket for bidirectional audio streaming
    const connect = response.connect();
    connect.stream({
      url: `wss://${req.get('host')}/voice/media-stream`
    });
    
    return response.toString();
  }

  /**
   * Handle Twilio media stream WebSocket connection
   * This is the core - bidirectional audio streaming between Twilio and Azure
   */
  handleMediaStream(ws, req) {
    console.log('📡 New Twilio media stream connected');
    
    // Connection-specific state
    let streamSid = null;
    let callSid = null;
    let callContext = null;
    let azureWs = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem = null;
    let markQueue = [];
    let responseStartTimestampTwilio = null;
    
    // Set up OpenAI Realtime connection
    const setupAzureConnection = async () => {
      const azureWsUrl = `${this.azureEndpoint.replace('https://', 'wss://')}/openai/realtime?api-version=2024-10-01-preview&deployment=${this.deploymentName}`;
      
      azureWs = new WebSocket(azureWsUrl, {
        headers: {
          'api-key': this.azureApiKey,
          'OpenAI-Beta': 'realtime=v1'
        }
      });
      
      azureWs.on('open', () => {
        console.log('🔗 Connected to OpenAI Realtime API');
        // Configure the session — buffer + history clear happens on session.updated
        this.sendSessionUpdate(azureWs, callContext);
      });

      azureWs.on('error', (error) => {
        console.error('❌ Azure WebSocket error:', error.message || error);
        if (callContext) {
          console.error(`   Call: ${callContext.callSid} | From: ${callContext.from}`);
        }
      });

      azureWs.on('close', (code, reason) => {
        console.log(`🔌 Azure WebSocket closed — code: ${code}, reason: ${reason?.toString() || 'none'}`);
        if (callContext && !callContext.isEnding) {
          console.warn('⚠️  Azure closed unexpectedly (AI may have gone silent). Hanging up.');
          this._hangupCall(callContext);
        }
      });

      azureWs.on('message', (message) => {
        try {
          const response = JSON.parse(message);
          
          // Log important events
          if (['error', 'response.done', 'input_audio_buffer.speech_started', 
               'input_audio_buffer.speech_stopped', 'session.created', 'session.updated'].includes(response.type)) {
            console.log(`🤖 Azure event: ${response.type}`);
          }
          
          // Send greeting once when session is confirmed configured
          if (response.type === 'session.updated' && callContext && !callContext.greetingSent) {
            console.log('✅ session.updated — flushing buffers then sending greeting');

            // Flush any stale audio that accumulated before session was ready.
            azureWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));

            callContext.greetingSent = true;
            this.sendInitialGreeting(azureWs, callContext);
          } else if (response.type === 'session.updated' && !callContext) {
            console.warn('⚠️ session.updated but callContext is null — cannot send greeting!');
          }

          // response.done — check for natural end on every turn
          if (response.type === 'response.done' && callContext) {
            // Safety net: partial transcript still set means audio_transcript.done
            // didn't fire (truncated/cancelled response) — discard and clear UI.
            if (callContext.currentTranscript) {
              console.log(`🧹 response.done with leftover partial transcript — discarding "${callContext.currentTranscript.slice(0, 40)}"`);
              callContext.currentTranscript = '';
              this._emitTranscriptClear(callContext);
            }
            this.checkForNaturalEnd(callContext);
          }
          
          if (response.type === 'error') {
            console.error('❌ Azure error:', JSON.stringify(response, null, 2));
          }
          
          // Handle speech interruption (barge-in)
          if (response.type === 'input_audio_buffer.speech_started') {
            if (callContext) callContext._lastSpeechStartedAt = Date.now();
            handleSpeechStarted();
          }

          // speech_stopped means the user completed a full, clean speech turn.
          // If a barge-in noise flag is still pending, the user spoke a real
          // utterance *after* the buffer.clear — clear the flag so their
          // transcript is accepted, not discarded.
          if (response.type === 'input_audio_buffer.speech_stopped') {
            if (callContext && callContext._bargeinTranscriptPending) {
              callContext._bargeinTranscriptPending = false;
            }
          }
          
          // Forward audio to Twilio
          if (response.type === 'response.audio.delta' && response.delta) {
            const audioDelta = {
              event: 'media',
              streamSid: streamSid,
              media: { payload: response.delta }
            };
            ws.send(JSON.stringify(audioDelta));
            
            if (!responseStartTimestampTwilio) {
              responseStartTimestampTwilio = latestMediaTimestamp;
            }
            
            if (response.item_id) {
              lastAssistantItem = response.item_id;
            }
            
            sendMark();
          }
          
          // Capture transcript delta (AI building response)
          if (response.type === 'response.audio_transcript.delta' && callContext) {
            if (!callContext.currentTranscript) {
              callContext.currentTranscript = '';
            }
            callContext.currentTranscript += response.delta || '';
            
            // Stream word-by-word delta to mobile app
            this.emitTranscriptDelta(callContext, response.delta || '', callContext.currentTranscript);
          }
          
          // User transcript completed
          if (response.type === 'conversation.item.input_audio_transcription.completed' && callContext) {
            const rawTranscript = (response.transcript || '').trim();

            // ── Hallucination / noise filter ──────────────────────────────
            // gpt-4o-mini-transcribe hallucinate on very short / noisy audio.
            // We apply multiple layers of filtering before accepting a transcript.

            // Known hallucination seed phrases (exact-match on short output)
            // Only YouTube/subscribe-style phrases that are never real caller speech.
            // "thank you" is intentionally excluded — callers say it genuinely.
            const HALLUCINATION_SEEDS = /^(thanks? for watching|thanks? you for watching|like and subscribe|subscribe|please subscribe|thank you for watching|please like|mixed hindi.?english|hinglish|देवनागरी|हिंदी में|।)[\.!,\s]?$/i;

            // Prompt-echo: transcript that is just the AI's own greeting echoed back.
            // Build dynamically from the actual greeting so it's not hardcoded per-user.
            const greetingSnippet = callContext.initialGreeting
              ? callContext.initialGreeting.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              : null;
            const PROMPT_ECHO = greetingSnippet
              ? new RegExp(greetingSnippet, 'i')
              : /(?!)/; // never-match fallback

            // URLs / website hallucinations (common on silence)
            const URL_HALLUCINATION = /\b(www\.|https?:\/\/|\.com|\.org|\.net|\.in)\b/i;

            // Gibberish detector: same syllable/akshara repeated 3+ times in a row
            // Catches things like "ग्योंग्योंग्यों", "ंग्योंग्यों", "babababa"
            const GIBBERISH_REPEAT = /(.{2,6})\1{2,}/u;

            // Highly suspicious filler-only transcripts that are too long to be real
            // "मैं बिलास्टेंसास बोल रहा हूँ के लिए।" — long but semantically incoherent
            // We detect this by checking ratio: very long transcript from a very short
            // speech window. We track speech start time per turn.
            // Post-barge-in grace window: even after input_audio_buffer.clear,
            // Azure may have already committed the captured fragment for transcription.
            // Discard the very first transcript after a barge-in.
            const isPostBargein = callContext._bargeinTranscriptPending === true;
            if (isPostBargein) {
              callContext._bargeinTranscriptPending = false;
            }

            if (!rawTranscript) {
              console.log('🚫 Empty transcript — discarding');
              return;
            }
            if (HALLUCINATION_SEEDS.test(rawTranscript)) {
              console.log(`🚫 Hallucination seed filtered: "${rawTranscript}"`);
              return;
            }
            if (PROMPT_ECHO.test(rawTranscript)) {
              console.log(`🚫 Prompt echo filtered: "${rawTranscript}"`);
              return;
            }
            if (URL_HALLUCINATION.test(rawTranscript)) {
              console.log(`🚫 URL hallucination filtered: "${rawTranscript}"`);
              return;
            }
            if (GIBBERISH_REPEAT.test(rawTranscript)) {
              console.log(`🚫 Gibberish (repeating syllable) filtered: "${rawTranscript}"`);
              return;
            }

            // First-turn filler filter: if the caller hasn't said anything real yet,
            // discard short polite fillers that are almost always barge-in bleed.
            // Once a real caller turn is accepted, these phrases are allowed through.
            const callerTurnCount = callContext.transcripts.filter(t => t.speaker === 'user').length;
            const FIRST_TURN_FILLER = /^(thank you|thanks|okay|ok|yes|yeah|no|hmm|uh|ah|oh|bye|hi|hello|sure)[.!,\s]?$/i;
            if (callerTurnCount === 0 && FIRST_TURN_FILLER.test(rawTranscript)) {
              console.log(`🚫 First-turn filler filtered: "${rawTranscript}"`);
              return;
            }

            if (isPostBargein) {
              console.log(`🚫 Post-barge-in noise transcript discarded: "${rawTranscript}"`);
              return;
            }
            // ──────────────────────────────────────────────────────────────

            console.log('📝 User:', rawTranscript);
            const transcriptEntry = {
              speaker: 'user',
              text: rawTranscript,
              timestamp: new Date().toISOString()
            };
            callContext.transcripts.push(transcriptEntry);

            // ── Real-time name extraction ──────────────────────────────
            // If we still don't know the caller's name, try to extract it now
            // so the mobile live-transcript screen shows it immediately.
            if (!callContext.context?.callerName || callContext.context.callerName === 'Unknown') {
              const detectedName = this._extractCallerName(rawTranscript);
              if (detectedName) {
                callContext.context = callContext.context || {};
                callContext.context.callerName = detectedName;
                console.log(`📛 Name detected live: "${detectedName}"`);
                // Emit name update to mobile app
                this._emitCallerNameUpdate(callContext, detectedName);
              }
            }
            // ──────────────────────────────────────────────────────────────

            // Emit to mobile app via Socket.io
            this.emitTranscript(callContext, transcriptEntry);
          }
          
          // AI transcript completed
          if (response.type === 'response.audio_transcript.done' && callContext) {
            const fullText = callContext.currentTranscript;
            callContext.currentTranscript = ''; // always reset
            if (!fullText || !fullText.trim()) return;
            console.log('\ud83d\udcdd AI:', fullText);
            const transcriptEntry = {
              speaker: 'assistant',
              text: fullText,
              timestamp: new Date().toISOString()
            };
            callContext.transcripts.push(transcriptEntry);
            this.emitTranscript(callContext, transcriptEntry);
          }

          // Response truncated (barge-in) — discard the partial delta accumulation
          // so it doesn’t bleed into the next AI turn
          if (response.type === 'response.content_part.done' && callContext) {
            // content_part.done fires for each content part; the audio transcript
            // comes via response.audio_transcript.done which resets it there.
            // This is a safety net for truncated responses.
          }

          if ((response.type === 'response.cancelled' || response.type === 'response.interrupted') && callContext) {
            console.log(`✂️ Response ${response.type} — discarding partial transcript "${callContext.currentTranscript?.slice(0, 40)}"`);
            callContext.currentTranscript = '';
            this._emitTranscriptClear(callContext);
          }
          
        } catch (error) {
          console.error('❌ Error processing Azure message:', error);
        }
      });
    };
    
    // Handle Twilio media messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.event === 'start') {
          streamSid = data.start.streamSid;
          callSid = data.start.callSid;
          
          console.log(`🎙️ Media stream started for call: ${callSid}`);
          console.log(`   From: ${data.start.customParameters?.from || 'Unknown'}`);
          
          // Get or create call context
          callContext = this.activeCalls.get(callSid);
          
          if (callContext) {
            callContext.twilioWs = ws;
            callContext.streamSid = streamSid;
            callContext.status = 'connected';

            // ── Context summary log ────────────────────────────────────
            const ctx = callContext.context || {};
            const callerCtx = ctx.callerCtx || {};
            const user = ctx.user || {};
            console.log('\n' + '═'.repeat(55));
            console.log('📞  CALL CONTEXT LOADED');
            console.log('─'.repeat(55));
            console.log(`   Direction  : ${callContext.direction}`);
            console.log(`   Call SID   : ${callSid}`);
            console.log(`   From       : ${callContext.from}`);
            console.log(`   To         : ${callContext.to}`);
            console.log(`   Owner      : ${user.name || 'Unknown'} (${callContext.userId})`);
            console.log('─'.repeat(55));
            console.log(`   Caller     : ${callerCtx.callerName || ctx.callerName || 'Unknown'}`);
            console.log(`   Total calls: ${callerCtx.totalCalls ?? 0}`);
            console.log(`   Last cat.  : ${callerCtx.lastCategoryLabel || 'None'}`);
            console.log(`   Is VIP     : ${ctx.isVIP ? '✅ YES' : '❌ No'}`);
            if (callerCtx.recentCalls && callerCtx.recentCalls.length > 0) {
              console.log(`   Call hist. : ${callerCtx.recentCalls.length} recent call(s)`);
              callerCtx.recentCalls.slice(0, 3).forEach((c, i) => {
                console.log(`     [${i + 1}] ${c.categoryLabel || c.categoryId || 'unknown'} — ${c.summary || 'no summary'}`);
              });
            } else {
              console.log(`   Call hist. : none (first contact)`);
            }
            console.log('─'.repeat(55));
            console.log(`   Categories : ${user.callCategories?.length ?? 0} loaded`);
            if (user.callCategories && user.callCategories.length > 0) {
              user.callCategories.forEach(cat => {
                console.log(`     ✅ [${cat.id}] ${cat.label} → ${cat.action}`);
              });
            }
            console.log('─'.repeat(55));
            console.log(`   Prompt     : ${callContext.systemPrompt?.length ?? 0} chars`);
            console.log(`   Greeting   : "${callContext.initialGreeting || '(none)'}"`);
            console.log('═'.repeat(55) + '\n');
            // ──────────────────────────────────────────────────────────

            // Connect to Azure
            await setupAzureConnection();
            
            if (azureWs) {
              callContext.azureWs = azureWs;
            }
          } else {
            console.error(`❌ No call context found for ${callSid}`);
          }
        }
        else if (data.event === 'media' && azureWs && azureWs.readyState === WebSocket.OPEN) {
          latestMediaTimestamp = data.media.timestamp;
          
          // Forward audio to Azure
          const audioAppend = {
            type: 'input_audio_buffer.append',
            audio: data.media.payload
          };
          azureWs.send(JSON.stringify(audioAppend));
        }
        else if (data.event === 'mark') {
          if (markQueue.length > 0) {
            markQueue.shift();
          }
          // Event-driven hangup: fire exactly when Twilio confirms the last
          // audio chunk was played (mark queue fully drained).
          if (markQueue.length === 0 && callContext?.pendingHangup) {
            console.log('✅ Mark queue drained — all AI audio played → hanging up in 1.5s');
            callContext.pendingHangup = false;
            if (callContext.pendingHangupTimer) {
              clearTimeout(callContext.pendingHangupTimer);
              callContext.pendingHangupTimer = null;
            }
            // Small delay so the last audio chunk finishes playing at the
            // phone speaker before Twilio cuts the media stream.
            setTimeout(() => this._hangupCall(callContext), 1500);
          }
        }
        else if (data.event === 'stop') {
          console.log(`📞 Media stream ended for call: ${callSid}`);
          if (callContext) {
            callContext.status = 'ended';
            callContext.endTime = new Date();
          }
          responseStartTimestampTwilio = null;
          latestMediaTimestamp = 0;
        }
        
      } catch (error) {
        console.error('❌ Error processing Twilio message:', error);
      }
    });
    
    // Helper: Send mark for playback tracking
    const sendMark = () => {
      if (streamSid) {
        const markEvent = {
          event: 'mark',
          streamSid: streamSid,
          mark: { name: 'responsePart' }
        };
        ws.send(JSON.stringify(markEvent));
        markQueue.push('responsePart');
      }
    };
    
    // Helper: Handle speech interruption (user starts talking while AI is speaking)
    const handleSpeechStarted = () => {
      if (markQueue.length > 0 && responseStartTimestampTwilio !== null && latestMediaTimestamp > 0) {
        const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
        
        if (elapsedTime > 100 && elapsedTime < 30000) {
          console.log(`🔄 User interrupted after ${elapsedTime}ms`);
          
          if (lastAssistantItem && azureWs && azureWs.readyState === WebSocket.OPEN) {
            // 0.9× elapsed is conservative, but latestMediaTimestamp can drift ahead
            // of actual audio sent to Azure, causing "audio shorter than Xms" errors.
            // Additionally cap against the number of mark chunks still pending:
            //   each Twilio G.711 μ-law chunk ≈ 20 ms at 8 kHz.
            // We take the minimum of the two estimates so we never over-truncate.
            const estimatedByTimestamp = Math.floor(elapsedTime * 0.9);
            const estimatedByMarks = markQueue.length * 20; // rough upper bound
            const safeTruncationTime = Math.min(estimatedByTimestamp, estimatedByMarks);
            
            if (safeTruncationTime >= 200) {
              const truncateEvent = {
                type: 'conversation.item.truncate',
                item_id: lastAssistantItem,
                content_index: 0,
                audio_end_ms: safeTruncationTime
              };
              console.log(`✂️ Truncating at ${safeTruncationTime}ms (timestamp→${estimatedByTimestamp}ms, marks→${estimatedByMarks}ms)`);
              azureWs.send(JSON.stringify(truncateEvent));
            } else {
              console.log(`⏭️ Skipping truncate — safe time ${safeTruncationTime}ms < 200ms`);
            }
          }
          
          // Clear Twilio's audio buffer
          ws.send(JSON.stringify({
            event: 'clear',
            streamSid: streamSid
          }));

          // Also clear Azure's input audio buffer so the noise fragment captured
          // during barge-in (AI audio bleed / room noise) is never committed for
          // transcription. Without this, the model transcribes that garbage audio.
          if (azureWs && azureWs.readyState === WebSocket.OPEN) {
            azureWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
            console.log('🧹 Azure input buffer cleared after barge-in');
          }

          // Flag: discard any transcript Azure committed from audio captured
          // *before* the buffer.clear arrived (noise/AI-bleed fragment).
          // Cleared immediately on the next speech_stopped so a real utterance
          // the user makes after the barge-in is never thrown away.
          if (callContext) callContext._bargeinTranscriptPending = true;

          markQueue = [];
          lastAssistantItem = null;
          responseStartTimestampTwilio = null;
        }
      }
    };
    
    ws.on('close', () => {
      console.log('📞 Twilio media stream disconnected');
      // Mark as ending so the Azure close handler doesn't fire a spurious hangup
      if (callContext) callContext.isEnding = true;
      if (azureWs && azureWs.readyState === WebSocket.OPEN) {
        azureWs.close();
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ Twilio WebSocket error:', error);
    });
  }

  /**
   * Send session configuration to OpenAI
   */
  sendSessionUpdate(azureWs, callContext) {
    if (!callContext) {
      console.error('❌ No call context for session update');
      return;
    }
    
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: callContext.systemPrompt,
        voice: this.voiceConfig.voice,
        input_audio_format: this.voiceConfig.inputAudioFormat,
        output_audio_format: this.voiceConfig.outputAudioFormat,
        input_audio_transcription: {
          // gpt-4o-mini-transcribe: deployed on this Azure resource (2025-12-15).
          // No prompt — giving a language/script instruction causes the model to
          // echo those exact words back as a transcript on noisy/silent audio
          // (e.g. "Transcribe Hindi in Devanagari script." appearing as user speech).
          // The model handles Hindi/English code-switching natively without prompting.
          model: 'gpt-4o-mini-transcribe'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.6,           // Raised from 0.5 — fewer false triggers on background noise
          prefix_padding_ms: 300,
          silence_duration_ms: 1000 // 1s silence ends the turn
        },
        temperature: this.voiceConfig.temperature,
        max_response_output_tokens: this.voiceConfig.maxResponseTokens
      }
    };
    
    console.log('⚙️ Configuring Azure session...');
    console.log(`   Voice: ${this.voiceConfig.voice}`);
    console.log(`   Prompt length: ${callContext.systemPrompt?.length || 0} chars`);
    console.log(`   Greeting: "${callContext.initialGreeting}"`);
    azureWs.send(JSON.stringify(sessionUpdate));
    console.log('📤 session.update sent to Azure — waiting for session.updated...');
  }

  /**
   * Send initial greeting (AI speaks first).
   *
   * Uses the officially documented "no-context response" pattern:
   *   response.create { input: [], instructions: "Say exactly: ..." }
   *
   * input: [] strips ALL existing conversation history from this response's
   * context — nothing from a previous session can bleed in. The instructions
   * field tells the model verbatim what to say. The response still lands in
   * the default conversation as a normal assistant turn.
   *
   * Ref: https://developers.openai.com/api/docs/guides/realtime-conversations
   *      § "Create responses with no context"
   */
  sendInitialGreeting(azureWs, callContext) {
    if (!callContext.initialGreeting) {
      console.error('❌ No initial greeting in call context!');
      return;
    }

    console.log('👋 Sending initial greeting to Azure...');
    console.log(`   Text: "${callContext.initialGreeting}"`);

    azureWs.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        // Empty input array = ignore all conversation history for this response.
        // Prevents stale items from previous sessions leaking into the greeting.
        input: [],
        // Tell the model exactly what to say — verbatim, nothing added.
        instructions: `Say exactly the following as your opening words, nothing before or after:\n"${callContext.initialGreeting}"`
      }
    }));

    console.log('✅ Greeting fired via no-context response.create');
  }

  /**
   * Check if conversation should naturally end.
   * Called after every `response.done` event from Azure.
   *
   * Three-tier detection:
   *   1. transferPattern  — AI says "Transferring you now." → live bridge to user.
   *   2. disconnectPattern — AI says "I'm disconnecting the call now." → hang up.
   *   3. goodbyePattern   — either party says an unambiguous goodbye → hang up.
   */
  checkForNaturalEnd(callContext) {
    // Need at least 3 transcript entries (greeting + ≥1 exchange) to avoid
    // triggering on the opening greeting or the caller's very first line.
    const totalMessages = callContext.transcripts?.length || 0;
    if (totalMessages <= 2) return;

    if (callContext.isEnding) return; // already handled

    const lastAI = callContext.transcripts
      .filter(t => t.speaker === 'assistant')
      .slice(-1)[0]?.text || '';

    const lastUser = callContext.transcripts
      .filter(t => t.speaker === 'user')
      .slice(-1)[0]?.text || '';

    // ── Pattern 0: AI-initiated live transfer (highest priority) ──────────
    // AI says "Transferring you now." (English) or "ट्रांसफर कर रहा हूँ।" (Hindi)
    // Also catches transliterated variants like "ट्रांसफरिंग यू नाउ" the model may produce.
    const transferPattern = /\btransferring you now\b|ट्रांसफर\s*कर\s*रहा|ट्रांसफरिंग\s*यू\s*नाउ/i;

    // ── Pattern 1: explicit disconnect announcement (fast hangup) ──────────
    // English + Hindi trigger phrases defined in the system prompt.
    const disconnectPattern = /\b(disconnecting the call now|disconnecting now|i'?m disconnecting|ending the call now)\b|मैं अभी कॉल डिस्कनेक्ट कर रहा|disconnect\s+कर\s+रहा|डिस्कनेक्ट\s+कर\s+रहा/i;

    // ── Pattern 2: unambiguous goodbye words only (softer hangup) ─────────
    // Deliberately excludes: "thank you", "thanks", "have a good day" — these
    // appear in normal mid-call polite speech and cause premature hangups.
    const goodbyePattern = /\b(goodbye|bye now|bye bye|talk (to you )?later|take care now|gotta go|i have to go|that will be all)\b|अलविदा|नमस्ते\s+फिर\s+मिलेंगे/i;

    const aiWantsTransfer  = transferPattern.test(lastAI);
    const aiDisconnected   = disconnectPattern.test(lastAI);
    const aiSaidGoodbye    = goodbyePattern.test(lastAI);
    const userSaidGoodbye  = goodbyePattern.test(lastUser);

    if (aiWantsTransfer) {
      console.log(`\n🔀 AI triggered live transfer → "${lastAI.trim()}"`);
      console.log(`   ↳ Bridging user in 1.5 s …`);
      callContext.isEnding = true; // block any further end/transfer checks
      setTimeout(() => this._initiateAITakeover(callContext), 1500);

    } else if (aiDisconnected) {
      console.log(`\n👋 AI announced disconnect → "${lastAI.trim()}"`);
      console.log(`   ↳ Will hang up once AI audio finishes playing (mark queue drains)`);
      callContext.isEnding = true;
      callContext.pendingHangup = true;
      // Safety-net: if Twilio never sends mark acks (e.g. call drops mid-audio)
      // hang up after 8 s so the call doesn’t linger open forever.
      callContext.pendingHangupTimer = setTimeout(() => {
        if (callContext.pendingHangup) {
          console.log('⚠️  Hangup safety-net fired (mark queue never drained)');
          callContext.pendingHangup = false;
          this._hangupCall(callContext);
        }
      }, 8000);

    } else if (aiSaidGoodbye || userSaidGoodbye) {
      const who = aiSaidGoodbye ? 'AI' : 'Caller';
      const line = aiSaidGoodbye ? lastAI : lastUser;
      console.log(`\n👋 ${who} said goodbye → "${line.trim()}"`);
      console.log(`   ↳ Will hang up once AI audio finishes playing (mark queue drains)`);
      callContext.isEnding = true;
      callContext.pendingHangup = true;
      callContext.pendingHangupTimer = setTimeout(() => {
        if (callContext.pendingHangup) {
          console.log('⚠️  Hangup safety-net fired (mark queue never drained)');
          callContext.pendingHangup = false;
          this._hangupCall(callContext);
        }
      }, 8000);
    }
  }

  /**
   * AI-triggered live transfer.
   * Emits 'call:takeover-needed' so voice.js can call twilioService.
   * Does NOT finalize the call — twilioService takes over the SID.
   */
  _initiateAITakeover(callContext) {
    const callSid = callContext.callSid;
    const userId  = callContext.userId;

    console.log(`🔀 Initiating AI-triggered takeover for ${callSid}`);
    console.log(`   Bridging in: ${userId}`);

    // Mark as taken over so transcript logic knows user is now in call
    callContext.isTakenOver = true;

    // Emit a system message so the transcript screen shows the handoff
    this.emitSystemTranscript(callContext, '📲 AI is transferring you to the owner now...');

    // Build a brief for the whisper the user hears before joining
    const recentTranscripts = callContext.transcripts.slice(-6); // last 3 turns
    const detectedCategory  = callContext.context?.detectedCategory || null;

    this.emit('call:takeover-needed', {
      callSid,
      userId,
      userPhoneNumber: userId,           // owner's phone = the number to dial
      callerName:   callContext.context?.callerName || 'Unknown',
      callerNumber: callContext.from,
      detectedCategory,
      recentTranscripts
    });
  }

  /**
   * Emit a system-level transcript message (e.g. "Takeover initiated")
   */
  emitSystemTranscript(callContext, text) {
    const entry = { speaker: 'system', text, timestamp: new Date().toISOString() };
    callContext.transcripts.push(entry);
    this.emitTranscript(callContext, entry);
  }

  /**
   * Tell Twilio to terminate the call, then run normal finalizeCall.
   * Safe to call multiple times (isEnding guard in checkForNaturalEnd).
   */
  async _hangupCall(callContext) {
    const callSid = callContext.callSid;
    console.log(`📵 Sending Twilio hangup for ${callSid}`);

    try {
      await this.twilioClient.calls(callSid).update({ status: 'completed' });
      console.log(`✅ Twilio hangup sent for ${callSid}`);
    } catch (err) {
      // Call may have already ended on Twilio's side — that's fine
      console.warn(`⚠️  Twilio hangup failed (may already be ended): ${err.message}`);
    }

    // Finalize locally regardless
    if (this.activeCalls.has(callSid)) {
      this.finalizeCall(callSid, 'completed');
    }
  }

  /**
   * Handle incoming call - creates call context
   */
  handleIncomingCall(callSid, from, to, systemPrompt, initialGreeting, context = {}) {
    console.log(`📞 Handling incoming call: ${callSid}`);
    console.log(`   From: ${from}`);
    console.log(`   To: ${to}`);
    
    const callContext = {
      callSid,
      from,
      to,
      userId: context.userId,  // For Socket.io room targeting
      direction: 'incoming',
      systemPrompt,
      initialGreeting,
      context,  // Previous call history, user info, etc.
      status: 'initiated',
      startTime: new Date(),
      endTime: null,
      transcripts: [],
      currentTranscript: '',
      greetingSent: false,   // prevents duplicate greetings if session.updated fires twice
      isEnding: false,
      isTakenOver: false,   // true once user joins via conference
      twilioWs: null,
      azureWs: null,
      streamSid: null
    };
    
    this.activeCalls.set(callSid, callContext);
    console.log(`✅ Call context created for ${callSid}`);
    
    // Emit call:started to mobile app
    this.emitCallStarted(callContext);
    
    return callContext;
  }

  /**
   * Handle call status updates from Twilio
   */
  handleCallStatus(callSid, status, duration) {
    const callContext = this.activeCalls.get(callSid);
    
    console.log(`📞 Call status update: ${callSid} → ${status}`);
    
    if (!callContext) {
      console.log(`⚠️ Status update for unknown call: ${callSid}`);
      return null;
    }
    
    callContext.status = status;
    callContext.duration = duration;
    
    // Terminal statuses
    const terminalStatuses = ['completed', 'failed', 'no-answer', 'busy', 'canceled'];
    
    if (terminalStatuses.includes(status)) {
      console.log(`🏁 Call ended: ${status}`);
      return this.finalizeCall(callSid, status);
    }
    
    return null;
  }

  /**
   * Finalize call and return result
   */
  finalizeCall(callSid, finalStatus) {
    const callContext = this.activeCalls.get(callSid);
    
    if (!callContext) {
      console.log(`⚠️ Cannot finalize unknown call: ${callSid}`);
      return null;
    }
    
    // Prevent duplicate finalization
    if (callContext.finalized) {
      return null;
    }
    callContext.finalized = true;
    
    console.log(`🏁 Finalizing call ${callSid}: ${finalStatus}`);
    
    // Close WebSockets
    if (callContext.azureWs && callContext.azureWs.readyState === WebSocket.OPEN) {
      callContext.azureWs.close();
    }
    if (callContext.twilioWs && callContext.twilioWs.readyState === WebSocket.OPEN) {
      callContext.twilioWs.close();
    }
    
    // Calculate duration
    const endTime = new Date();
    const duration = callContext.duration || Math.floor((endTime - callContext.startTime) / 1000);
    
    // Build result
    const result = {
      callId: callSid,
      userId: callContext.userId,       // owner's phone number — never 'default'
      from: callContext.from,
      to: callContext.to,
      direction: callContext.direction,
      status: finalStatus,
      duration,
      startTime: callContext.startTime,
      endTime,
      transcripts: callContext.transcripts || [],
      context: callContext.context
    };
    
    console.log(`📊 Call result: ${result.transcripts.length} transcript entries, ${duration}s`);
    
    // Emit event for call completion
    this.emit('call:completed', result);
    
    // Emit call:ended to mobile app via Socket.io
    this.emitCallEnded(callContext, result);
    
    // Cleanup after delay
    setTimeout(() => {
      this.activeCalls.delete(callSid);
    }, 60000); // Keep for 1 minute for any late processing
    
    return result;
  }

  /**
   * Get active call stats
   */
  getActiveCallStats() {
    return {
      totalActiveCalls: this.activeCalls.size,
      calls: Array.from(this.activeCalls.entries()).map(([sid, ctx]) => ({
        callSid: sid,
        from: ctx.from,
        status: ctx.status,
        duration: Math.floor((new Date() - ctx.startTime) / 1000)
      }))
    };
  }

  // ============================================
  // Socket.io Event Emitters
  // ============================================

  /**
   * Best-effort real-time name extraction from a single transcript line.
   * Returns the name string, or null if not found.
   */
  _extractCallerName(text) {
    if (!text) return null;

    // Patterns like: "I'm Rahul", "This is Priya", "My name is Amit Shah", "It's Ravi"
    // Require the matched name to be a proper capitalized word, NOT a preposition/article.
    const STOP_WORDS = /^(the|a|an|from|at|in|on|for|with|calling|i|am|is|my|this)$/i;

    const introMatch = text.match(
      /(?:i(?:'?m| am)|this is|my name is|it'?s|name'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    );
    if (introMatch) {
      const candidate = introMatch[1].trim();
      // Reject if any word is a stop word (e.g. "calling from")
      if (!candidate.split(/\s+/).some(w => STOP_WORDS.test(w))) {
        return candidate;
      }
    }

    // "Ravi here" / single capitalised word at start of sentence
    const simpleMatch = text.match(
      /^([A-Z][a-z]{2,})(?:\s+here)?[.,!?]?\s*$/
    );
    if (simpleMatch && !STOP_WORDS.test(simpleMatch[1])) return simpleMatch[1].trim();

    return null;
  }

  /**
   * Emit caller:name-updated so the mobile live-transcript screen can show
   * the caller's name in real time without waiting for post-call analysis.
   */
  _emitCallerNameUpdate(callContext, callerName) {
    if (!this.io) return;
    const userId = callContext.userId;
    this.io.to(`user:${userId}`).emit('call:caller-name', {
      callId: callContext.callSid,
      callerName,
      timestamp: new Date().toISOString()
    });
    console.log(`📱 Emitted call:caller-name "${callerName}" to user:${userId}`);
  }

  /**
   * Set Socket.io instance (for use when initialized separately)
   */
  setSocketIO(io) {
    this.io = io;
    console.log('✅ Socket.io attached to VoiceAgent');
  }

  /**
   * Emit call:started event to mobile app
   *
   * suppressNotification = true during priority time — the mobile app should
   * NOT ring or show an incoming-call notification; the AI handles silently.
   * isVIP = true when the caller is in the user's VIP list.
   */
  emitCallStarted(callContext) {
    if (!this.io) return;
    
    const userId = callContext.userId;
    const callerName = callContext.context?.callerName || 'Unknown';
    const isVIP = callContext.context?.isVIP || false;
    const suppressNotification = callContext.context?.suppressNotification || false;
    const inPriorityTime = callContext.context?.priorityTimeInfo?.inPriorityTime || false;
    
    this.io.to(`user:${userId}`).emit('call:started', {
      callId: callContext.callSid,
      from: callContext.from,
      to: callContext.to,
      callerName,
      timestamp: callContext.startTime.toISOString(),
      isVIP,
      inPriorityTime,
      suppressNotification  // if true, mobile app skips notification/ringing
    });
    
    console.log(`📱 Emitted call:started to user:${userId} (VIP=${isVIP}, suppress=${suppressNotification})`);
  }

  /**
   * Tell the mobile app to drop any dangling streaming (barge-in) bubble.
   * Emitted when a response is cancelled/interrupted before completing.
   */
  _emitTranscriptClear(callContext) {
    if (!this.io) return;
    const userId = callContext.userId;
    this.io.to(`user:${userId}`).emit('call:transcript:clear', {
      callId: callContext.callSid,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit call:transcript:delta — word-by-word streaming as AI speaks
   */
  emitTranscriptDelta(callContext, delta, fullText) {
    if (!this.io) return;
    
    const userId = callContext.userId;
    
    this.io.to(`user:${userId}`).emit('call:transcript:delta', {
      callId: callContext.callSid,
      speaker: 'ai',
      delta,
      fullText,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit call:transcript event to mobile app (live transcript updates)
   * speaker mapping:
   *   'assistant' → 'ai'
   *   'user'      → 'caller' (before takeover) | 'user' (after takeover — the owner speaking)
   *   'system'    → 'system'
   */
  emitTranscript(callContext, transcriptEntry) {
    if (!this.io) return;
    
    const userId = callContext.userId;
    
    let speaker;
    if (transcriptEntry.speaker === 'assistant') {
      speaker = 'ai';
    } else if (transcriptEntry.speaker === 'system') {
      speaker = 'system';
    } else if (transcriptEntry.speaker === 'user_owner') {
      // Post-takeover: the owner (user) is now speaking
      speaker = 'user';
    } else {
      // 'user' = the caller (person who rang in)
      speaker = 'caller';
    }
    
    this.io.to(`user:${userId}`).emit('call:transcript', {
      callId: callContext.callSid,
      speaker,
      text: transcriptEntry.text,
      timestamp: transcriptEntry.timestamp
    });
  }

  /**
   * Emit call:intent event when intent is detected
   */
  emitIntent(callContext, intent, confidence = 0.8) {
    if (!this.io) return;
    
    const userId = callContext.userId;
    
    this.io.to(`user:${userId}`).emit('call:intent', {
      callId: callContext.callSid,
      intent,
      confidence,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📱 Emitted call:intent ${intent} to user:${userId}`);
  }

  /**
   * Emit call:action event when AI takes an action based on preferences
   */
  emitAction(callContext, action, response) {
    if (!this.io) return;
    
    const userId = callContext.userId;
    
    this.io.to(`user:${userId}`).emit('call:action', {
      callId: callContext.callSid,
      action,
      response,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit call:ended event to mobile app
   */
  emitCallEnded(callContext, result) {
    if (!this.io) return;
    
    const userId = callContext.userId;
    
    this.io.to(`user:${userId}`).emit('call:ended', {
      callId: callContext.callSid,
      from: callContext.from,
      duration: result.duration,
      status: result.status,
      transcriptCount: result.transcripts.length,
      summary: result.context?.analysis?.summary || 'Call completed',
      timestamp: new Date().toISOString()
    });
    
    console.log(`📱 Emitted call:ended to user:${userId}`);
  }
}

export default VoiceAgent;
