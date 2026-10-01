import ExpoModulesCore
import ImageIO
import UIKit
import Vision

// On-device receipt text recognition with Apple's Vision framework. Returns every recognized
// text line with a pixel bounding box (top-left origin, in the photo's upright orientation) and
// its baseline angle, so the server can rebuild receipt rows. Vision ships with iOS: no model
// download, no extra app size, and it runs on the simulator (unlike Google ML Kit's pods).
public class ReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      guard let image = Self.loadImage(uri), let cgImage = image.cgImage else {
        promise.reject("ERR_RECEIPT_OCR_IMAGE", "Could not load the image at \(uri)")
        return
      }
      // Size in the upright orientation — the space Vision's normalized boxes are in once
      // we pass the photo's EXIF orientation to the request handler.
      let width = image.size.width * image.scale
      let height = image.size.height * image.scale

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
          return
        }
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        var lines: [[String: Any]] = []
        for obs in observations {
          guard let candidate = obs.topCandidates(1).first else { continue }
          let box = obs.boundingBox  // normalized, origin bottom-left
          let dx = Double(obs.topRight.x - obs.topLeft.x) * Double(width)
          let dy = Double(obs.topRight.y - obs.topLeft.y) * Double(height)
          lines.append([
            "text": candidate.string,
            "x": Double(box.minX * width),
            "y": Double((1 - box.maxY) * height),
            "width": Double(box.width * width),
            "height": Double(box.height * height),
            // Vision's y axis points up; flip so a positive angle means the text slopes down,
            // matching image coordinates.
            "angle": dx > 0 ? atan2(-dy, dx) : 0,
            "confidence": Double(candidate.confidence),
          ])
        }
        promise.resolve(["lines": lines, "width": Double(width), "height": Double(height)])
      }
      request.recognitionLevel = .accurate
      // Receipts are full of SKUs, abbreviations and prices; "correcting" them to dictionary
      // words does more harm than good.
      request.usesLanguageCorrection = false
      request.recognitionLanguages = ["en-US"]

      let handler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: CGImagePropertyOrientation(image.imageOrientation),
        options: [:]
      )
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try handler.perform([request])
        } catch {
          promise.reject("ERR_RECEIPT_OCR", error.localizedDescription)
        }
      }
    }
  }

  private static func loadImage(_ uri: String) -> UIImage? {
    let url: URL
    if let parsed = URL(string: uri), parsed.scheme != nil {
      url = parsed
    } else {
      url = URL(fileURLWithPath: uri)
    }
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
  }
}

private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
