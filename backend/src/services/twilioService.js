/**
 * Twilio Service
 * Handles call forwarding, conference bridges, and call takeover
 * 
 * Call Takeover Flow:
 * 1. Create a Conference room
 * 2. Move the existing call (AI + caller) into Conference
 * 3. Dial the user's phone and add them to Conference
 * 4. AI disconnects, leaving user talking directly with caller
 */

import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID, 
  process.env.TWILIO_AUTH_TOKEN
);

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

/**
 * Initiate call takeover - User wants to join an active call
 * @param {string} callSid - Current call SID (AI talking with caller)
 * @param {string} userPhoneNumber - User's phone number to dial
 * @param {Object} callContext - Call context for whisper summary
 * @returns {Promise<Object>} Conference details
 */
export const initiateCallTakeover = async (callSid, userPhoneNumber, callContext = {}) => {
  console.log(`📞 Initiating call takeover for ${callSid}`);
  console.log(`   Dialing user: ${userPhoneNumber}`);
  
  try {
    // Generate unique conference name
    const conferenceName = `takeover-${callSid}-${Date.now()}`;
    
    // Step 1: Update the existing call to join a conference
    // This moves the caller into a conference room
    await twilioClient.calls(callSid).update({
      twiml: `<Response>
        <Say>One moment, let me connect you with them now.</Say>
        <Dial>
          <Conference 
            beep="false" 
            startConferenceOnEnter="true" 
            endConferenceOnExit="false"
            waitUrl=""
          >${conferenceName}</Conference>
        </Dial>
      </Response>`
    });
    
    console.log(`✅ Moved caller to conference: ${conferenceName}`);
    
    // Step 2: Call the user and add them to the same conference
    // Include a whisper with call summary before connecting
    const whisperText = generateWhisperSummary(callContext);
    
    const userCall = await twilioClient.calls.create({
      to: userPhoneNumber,
      from: TWILIO_PHONE_NUMBER,
      twiml: `<Response>
        <Say>${whisperText}</Say>
        <Dial>
          <Conference 
            beep="false" 
            startConferenceOnEnter="true" 
            endConferenceOnExit="true"
          >${conferenceName}</Conference>
        </Dial>
      </Response>`,
      statusCallback: `${WEBHOOK_URL}/voice/takeover-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });
    
    console.log(`✅ Called user: ${userCall.sid}`);
    
    return {
      success: true,
      conferenceName,
      originalCallSid: callSid,
      userCallSid: userCall.sid,
      status: 'connecting'
    };
    
  } catch (error) {
    console.error('❌ Call takeover failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Generate the spoken whisper the user hears BEFORE they join the conference.
 * This is spoken by Twilio TTS so it must be plain natural speech — no punctuation tricks.
 * Covers: who called, what they want, and the last thing they said.
 */
function generateWhisperSummary(callContext) {
  const callerName = callContext.callerName || 'Unknown caller';
  const triggeredByAI = callContext.triggeredByAI || false;

  const categoryLabels = {
    'delivery.food':      'a food delivery',
    'delivery.package':   'a package delivery',
    'delivery.grocery':   'a grocery delivery',
    'service.maintenance': 'a maintenance visit',
    'service.visitor':    'a visitor',
    'business.sales':     'a sales call',
    'personal.unknown':   'a personal call'
  };

  const categoryDesc = callContext.detectedCategory
    ? categoryLabels[callContext.detectedCategory] || 'a call'
    : 'a call';

  // Pull the last few lines from the transcript
  const turns = (callContext.transcripts || []).slice(-6); // last 3 back-and-forths
  const lastCallerLine = turns
    .filter(t => t.speaker === 'user' || t.speaker === 'caller')
    .slice(-1)[0]?.text || '';

  let parts = [];

  if (triggeredByAI) {
    parts.push(`Your AI assistant is transferring ${categoryDesc} from ${callerName}.`);
  } else {
    parts.push(`Incoming call from ${callerName}.`);
    if (callContext.detectedCategory) {
      parts.push(`This appears to be ${categoryDesc}.`);
    }
  }

  if (lastCallerLine) {
    const snippet = lastCallerLine.length > 80
      ? lastCallerLine.substring(0, 80) + '...'
      : lastCallerLine;
    parts.push(`The caller last said: ${snippet}`);
  }

  parts.push('Connecting you now.');

  return parts.join(' ');
}

/**
 * Add user to existing conference (alternative method)
 * @param {string} conferenceSid - Conference SID
 * @param {string} userPhoneNumber - User's phone number
 */
export const addUserToConference = async (conferenceSid, userPhoneNumber) => {
  console.log(`📞 Adding user to conference: ${conferenceSid}`);
  
  try {
    const participant = await twilioClient
      .conferences(conferenceSid)
      .participants
      .create({
        from: TWILIO_PHONE_NUMBER,
        to: userPhoneNumber,
        beep: 'false',
        endConferenceOnExit: true
      });
    
    console.log(`✅ User added to conference: ${participant.callSid}`);
    return { success: true, participantSid: participant.callSid };
    
  } catch (error) {
    console.error('❌ Failed to add user to conference:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * End a call
 * @param {string} callSid - Call SID to terminate
 */
export const endCall = async (callSid) => {
  console.log(`📞 Ending call: ${callSid}`);
  
  try {
    await twilioClient.calls(callSid).update({ status: 'completed' });
    console.log(`✅ Call ended: ${callSid}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to end call:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get call recording URL
 * @param {string} callSid - Call SID
 * @returns {Promise<string>} Recording URL
 */
export const getRecordingUrl = async (callSid) => {
  try {
    const recordings = await twilioClient.recordings.list({ callSid, limit: 1 });
    if (recordings.length > 0) {
      return `https://api.twilio.com${recordings[0].uri.replace('.json', '.mp3')}`;
    }
    return null;
  } catch (error) {
    console.error('❌ Failed to get recording:', error.message);
    return null;
  }
};

/**
 * Get active conference details
 * @param {string} conferenceName - Conference friendly name
 */
export const getConferenceDetails = async (conferenceName) => {
  try {
    const conferences = await twilioClient.conferences.list({
      friendlyName: conferenceName,
      status: 'in-progress',
      limit: 1
    });
    
    if (conferences.length > 0) {
      const participants = await twilioClient
        .conferences(conferences[0].sid)
        .participants
        .list();
      
      return {
        conferenceSid: conferences[0].sid,
        status: conferences[0].status,
        participantCount: participants.length,
        participants: participants.map(p => ({
          callSid: p.callSid,
          muted: p.muted,
          hold: p.hold
        }))
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Failed to get conference details:', error.message);
    return null;
  }
};

export default {
  initiateCallTakeover,
  addUserToConference,
  endCall,
  getRecordingUrl,
  getConferenceDetails
};
