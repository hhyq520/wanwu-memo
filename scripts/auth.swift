import Foundation
import LocalAuthentication

let reason = CommandLine.argc > 1 ? CommandLine.arguments[1] : "查看或隐藏私密备忘"
let context = LAContext()
var policyError: NSError?
guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &policyError) else {
  fputs((policyError?.localizedDescription ?? "这台 Mac 无法验证") + "\n", stderr)
  exit(2)
}

let sem = DispatchSemaphore(value: 0)
var ok = false
context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
  ok = success
  if let evalError, !success {
    fputs(evalError.localizedDescription + "\n", stderr)
  }
  sem.signal()
}

DispatchQueue.global().async {
  sem.wait()
  exit(ok ? 0 : 1)
}
dispatchMain()
