import ExpoModulesCore
import UIKit
import Vision

final class ImageLoadException: Exception {
  override var reason: String {
    "The image could not be read."
  }
}

public class ClosetVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClosetVision")

    // Returns one entry per person found in the image. Boxes are normalised
    // to 0...1 with the origin at the top-left corner.
    AsyncFunction("detectPeople") { (uri: String) -> [[String: Double]] in
      let image = try loadImage(uri)
      let request = VNDetectHumanRectanglesRequest()
      request.upperBodyOnly = false
      let handler = VNImageRequestHandler(
        cgImage: image.cgImage,
        orientation: image.orientation,
        options: [:]
      )
      try handler.perform([request])
      return (request.results ?? []).map { observation in
        let box = observation.boundingBox
        return [
          "x": Double(box.minX),
          // Vision puts the origin at the bottom-left; flip to top-left.
          "y": Double(1 - box.maxY),
          "width": Double(box.width),
          "height": Double(box.height),
          "confidence": Double(observation.confidence)
        ]
      }
    }

    // Isolates the main subject of a photo on a transparent background,
    // trimmed to the subject. Writes a PNG to the temporary directory and
    // returns its URI and size, or nil when no subject is found or the
    // system is older than iOS 17.
    AsyncFunction("removeBackground") { (uri: String) -> [String: Any]? in
      guard #available(iOS 17.0, *) else {
        return nil
      }
      let image = try loadImage(uri)
      let request = VNGenerateForegroundInstanceMaskRequest()
      let handler = VNImageRequestHandler(
        cgImage: image.cgImage,
        orientation: image.orientation,
        options: [:]
      )
      try handler.perform([request])
      guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
        return nil
      }
      let buffer = try observation.generateMaskedImage(
        ofInstances: observation.allInstances,
        from: handler,
        croppedToInstancesExtent: true
      )
      let ciImage = CIImage(cvPixelBuffer: buffer)
      let context = CIContext()
      guard
        let cutout = context.createCGImage(ciImage, from: ciImage.extent),
        let data = UIImage(cgImage: cutout).pngData()
      else {
        throw ImageWriteException()
      }
      let target = FileManager.default.temporaryDirectory
        .appendingPathComponent("cutout-\(UUID().uuidString).png")
      try data.write(to: target)
      return [
        "uri": target.absoluteString,
        "width": cutout.width,
        "height": cutout.height
      ]
    }
  }
}

final class ImageWriteException: Exception {
  override var reason: String {
    "The cutout could not be saved."
  }
}

private struct LoadedImage {
  let cgImage: CGImage
  let orientation: CGImagePropertyOrientation
}

private func loadImage(_ uri: String) throws -> LoadedImage {
  let path: String
  if let url = URL(string: uri), url.isFileURL {
    path = url.path
  } else {
    // Not a parseable file URL (for example an unencoded space): treat it as a plain path.
    let stripped = uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
    path = stripped.removingPercentEncoding ?? stripped
  }
  guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
    throw ImageLoadException()
  }
  return LoadedImage(cgImage: cgImage, orientation: cgOrientation(image.imageOrientation))
}

private func cgOrientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
  switch orientation {
  case .up: return .up
  case .down: return .down
  case .left: return .left
  case .right: return .right
  case .upMirrored: return .upMirrored
  case .downMirrored: return .downMirrored
  case .leftMirrored: return .leftMirrored
  case .rightMirrored: return .rightMirrored
  @unknown default: return .up
  }
}
