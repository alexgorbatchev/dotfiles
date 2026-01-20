We will be reviewing `.tool.ts` files in the `review` folder for this job. Below are the details.

# Originals

the `original` folder contains source of truth tool configuration written in zsh, the tools here are installed using zinit most of the time and otherwise standard common tooling. Each tool has `init.zsh` file that is sourced at shell startup. The system automatically sets up an alias for each tool using `alias-installer`, so that the `install.zsh` function is called. For example:

```shell
# init.zsh
alias-installer foo

# install.zsh
function install--foo() {
  zinit ice from=gh-r as=program \
    completions="*/autocomplete/foo.zsh" \
    mv="*/foo -> foo"

  zinit load bar/foo
}
```

Both files are sourced by the shell at startup. When `foo` is called by the user, the `install--foo` function is invoked to install the tool if it is not already installed.

Some tools only have `init.zsh` file, which typically means they are auto-installed on first shell start up.

Some tools have additional files that either `init.zsh` or `install.zsh` refer to in some way.

# Review

the `review` folder contains the same tools rewritten in the format of the `@dotfiles` project we are in. The names of the originals match tool files names here, for example:

`original/bat` -> `review/**/bat.tool.ts`

The `.tool.ts` files in the `review` folder could be somewhat nested.

# Task

Your job is to review the `.tool.ts` files in the `review` folder and ensure they correctly represent the corresponding tools from the `original` folder.

To do that, follow these steps:
- Read the `docs` folder completely, no sampling. This needs to be done once to understand how `.tool.ts` tools are defined.
- List all original tools in the `original/*` folder.
- Make `review/REVIEW.md ` file with the check list of all tools.
- Start development proxy using `bun proxy` command, this proxy will cache and serve all responses from remote APIs so that we can avoid API rate limits.

**important**: all commands to the test CLI must use this format `DEV_PROXY=3128 bun cli --config=review/config.ts [additional arguments]`, ensuring the proxy is used. We will refer to this as simply `dotfiles-cli` going forward.

Then for each tool:

- Read all files in the original tool definition in the `original/[tool_name]/*` folder.
- Find the corresponding `[tool_name].tool.ts` file in the `review` folder. If it is in its own folder, read all files in that folder. These support files should match the additional files in the original tool definition.
- Run `dotfiles-cli install [<tool_name>]` to install the tool and capture the output.
- Review the output for any errors or discrepancies compared to the original tool installation process.
- The installation should emit `review/.generated/user-bin/[binary_name]` files specified by the `.bin()` method in the `.tool.ts` file. Run each `[binary_name] --version` to verify that it executes successfully.
- If the `install` call doesn't have any errors or warnings and all of the `[binary_name]` files executed successfully, the tool is considered correctly represented in the `review` folder. Mark it as complete in the `review/REVIEW.md` checklist.
- If the `install` call had warning, errors or any of the `[binary_name]` files failed to execute successfully, the tool is considered not correctly represented in the `review` folder. Write down what went wrong for that tool in `review/REVIEW.md` file, do not fix anything.
- If the `review/**/[tool_name]` is missing any supporting files, make a note of that in the `review/REVIEW.md` file.
- Continue to the next tool.

**important**: this is a review process only, do not fix any errors or issues.
