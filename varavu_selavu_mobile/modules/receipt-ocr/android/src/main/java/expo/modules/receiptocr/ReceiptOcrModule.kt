package expo.modules.receiptocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.atan2

// On-device receipt text recognition with Google ML Kit (bundled Latin model). Returns every
// recognized text line with a pixel bounding box and baseline angle, so the server can rebuild
// receipt rows — same shape as the iOS (Vision) implementation.
class ReceiptOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOcr")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_RECEIPT_OCR", "No React context", null)
        return@AsyncFunction
      }
      val image = try {
        // fromFilePath applies the photo's EXIF rotation, so boxes are in upright coordinates.
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("ERR_RECEIPT_OCR_IMAGE", "Could not load the image at $uri", e)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { text ->
          val lines = mutableListOf<Map<String, Any>>()
          for (block in text.textBlocks) {
            for (line in block.lines) {
              val box = line.boundingBox ?: continue
              val corners = line.cornerPoints
              val angle = if (corners != null && corners.size >= 2 && corners[1].x != corners[0].x) {
                atan2((corners[1].y - corners[0].y).toDouble(), (corners[1].x - corners[0].x).toDouble())
              } else 0.0
              lines.add(
                mapOf(
                  "text" to line.text,
                  "x" to box.left.toDouble(),
                  "y" to box.top.toDouble(),
                  "width" to box.width().toDouble(),
                  "height" to box.height().toDouble(),
                  "angle" to angle,
                  "confidence" to line.confidence.toDouble(),
                )
              )
            }
          }
          promise.resolve(mapOf("lines" to lines))
          recognizer.close()
        }
        .addOnFailureListener { e ->
          promise.reject("ERR_RECEIPT_OCR", e.message ?: "Text recognition failed", e)
          recognizer.close()
        }
    }
  }
}
