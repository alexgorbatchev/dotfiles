import type { Meta, StoryObj } from "@storybook/preact";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../Table";

const meta: Meta<typeof Table> = {
  title: "@dotfiles/dashboard/client/components/ui/Table",
  component: Table,
  tags: ["!test"],
};

type Story = StoryObj<typeof meta>;

const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>fzf</TableCell>
          <TableCell>installed</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export default meta;
export { Default as Table };
