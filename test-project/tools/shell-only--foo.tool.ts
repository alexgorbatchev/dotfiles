import { defineTool } from '@dotfiles/cli';

export default defineTool((install, _ctx) =>
  install()
    //
    .zsh((shell) =>
      shell
        //
        .aliases({ foo: 'echo "This is foo tool"' })
        .functions({
          foosetup: 'echo "Setting up foo with HOME=$HOME"',
          '123invalid': 'echo "This should be rejected"',
        })
    )
);
