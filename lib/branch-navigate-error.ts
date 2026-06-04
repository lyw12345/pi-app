/** Map pi navigate_tree / branch summary errors to short user-facing text (keys in branchNavigator.*). */
export function branchNavigateErrorKey(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("model") && (lower.includes("no") || lower.includes("not") || lower.includes("select"))) {
    return "branchNavigator.errorNoModel";
  }
  if (lower.includes("abort") || lower.includes("cancel")) {
    return "branchNavigator.errorCancelled";
  }
  return "branchNavigator.errorGeneric";
}
