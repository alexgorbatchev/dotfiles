import { dedentString, dedentTemplate } from "@alexgorbatchev/dotfiles";
import { expectType } from "tsd";

// Both are the same runtime helper: callable as a plain function and as a tagged
// template, in either spelling.
expectType<string>(dedentString("  line 1\n  line 2"));
expectType<string>(dedentTemplate("  line 1\n  line 2"));

const dir = "/opt/tool";
expectType<string>(dedentString`
  if [[ -d "${dir}" ]]; then
    echo "present"
  fi
`);
expectType<string>(dedentTemplate`
  export TOOL_HOME="${dir}"
`);
