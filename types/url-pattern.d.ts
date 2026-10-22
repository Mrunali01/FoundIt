// Next's URLPattern declarations reference aliases not included in @types/node.
type URLPatternInput = string | URLPatternInit;
interface URLPatternOptions {
  ignoreCase?: boolean;
}
