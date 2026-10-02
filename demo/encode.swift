// Encodes build/frames/*.jpg + build/audio/mix.wav into an H.264/AAC MP4 using AVFoundation.
//   swift demo/encode.swift <framesDir> <fps> <audio.wav> <out.mp4>
import AVFoundation
import AppKit
import CoreVideo

let args = CommandLine.arguments
guard args.count == 5, let fps = Int32(args[2]) else {
  print("usage: encode.swift <framesDir> <fps> <audio.wav> <out.mp4>"); exit(1)
}
let framesDir = URL(fileURLWithPath: args[1])
let audioURL = URL(fileURLWithPath: args[3])
let outURL = URL(fileURLWithPath: args[4])
let videoOnly = outURL.deletingPathExtension().appendingPathExtension("video.mov")
try? FileManager.default.removeItem(at: videoOnly)
try? FileManager.default.removeItem(at: outURL)

let frames = try FileManager.default.contentsOfDirectory(atPath: framesDir.path).filter { $0.hasSuffix(".jpg") }.sorted()
guard !frames.isEmpty else { print("no frames"); exit(1) }
let W = 1920, H = 1080

// ── 1) Frames → H.264 (video only) ─────────────────────────────────────────
let writer = try AVAssetWriter(outputURL: videoOnly, fileType: .mov)
let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpaceCreateDeviceRGB()
for (i, name) in frames.enumerated() {
  autoreleasepool {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
    guard let img = NSImage(contentsOf: framesDir.appendingPathComponent(name)),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buffer = pb else { return }
    CVPixelBufferLockBaseAddress(buffer, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: colorSpace,
                        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)
    ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
    CVPixelBufferUnlockBaseAddress(buffer, [])
    adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
    if i % 1200 == 0 { print("encoded \(i)/\(frames.count)") }
  }
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
guard writer.status == .completed else { print("video write failed: \(String(describing: writer.error))"); exit(1) }

// ── 2) Video + mixed voice track → MP4 ─────────────────────────────────────
let comp = AVMutableComposition()
let vAsset = AVURLAsset(url: videoOnly)
let aAsset = AVURLAsset(url: audioURL)
let vTrack = vAsset.tracks(withMediaType: .video)[0]
let aTrack = aAsset.tracks(withMediaType: .audio)[0]
let duration = vAsset.duration
let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try cv.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: vTrack, at: .zero)
let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let aDur = CMTimeMinimum(duration, aAsset.duration)
try ca.insertTimeRange(CMTimeRange(start: .zero, duration: aDur), of: aTrack, at: .zero)

guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else { print("no export session"); exit(1) }
export.outputURL = outURL
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true
let sem2 = DispatchSemaphore(value: 0)
export.exportAsynchronously { sem2.signal() }
sem2.wait()
if export.status == .completed {
  try? FileManager.default.removeItem(at: videoOnly)
  print("wrote \(outURL.path)")
} else {
  print("export failed: \(String(describing: export.error))"); exit(1)
}
