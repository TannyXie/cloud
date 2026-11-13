import "@/lib/workflows/test/dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AxiosAdapter } from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import { UserContext } from "@/app/auth/user";
import { http } from "@/lib/api-client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { defaultWorkflowSidebar, useUiStore } from "@/lib/workflows/host/ui-store";
import { LocalWorkflowBackend, browserWorkflowStorage } from "@/lib/workflows/data/local-workflow-backend";
import {
  memoryWorkflowStorage,
  sampleWorkflowBackend,
  serveWorkflows,
  type WorkflowServer,
} from "@/lib/workflows/test/workflow-server";
import { demoUser, fakeBackend } from "@/test/backend";
import Page from "./page";

const tenantId = "00000000-0000-4000-8000-0000000000aa";

/** The signed-in user's one tenant, whose workflows `server` holds. */
function serve(backend: LocalWorkflowBackend): WorkflowServer {
  fakeBackend((config) => {
    if (config.url === "/api/v1/me") return { status: 200, data: demoUser };
    if (config.url === "/api/v1/me/tenants")
      return {
        status: 200,
        data: { items: [{ id: tenantId, name: "演示团队", status: "active", role: "owner" }], nextCursor: "" },
      };
    return undefined;
  });
  return serveWorkflows(tenantId, backend);
}

/** Renders the page and waits until it has read the tenant and shows the library. */
async function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <UserContext.Provider value={demoUser}>
        <TooltipProvider>
          <Page />
        </TooltipProvider>
      </UserContext.Provider>
    </QueryClientProvider>,
  );
  await screen.findByRole("complementary", { name: "工作流列表" });
  return rendered;
}

const library = () => screen.getByRole("complementary", { name: "工作流列表" });

/** Creates a workflow through desktop's library menu and name dialog. */
async function createWorkflow(user: ReturnType<typeof userEvent.setup>, name: string) {
  const addMenu = await within(library()).findByRole("button", {
    name: "新建或导入工作流",
  });
  // The library enables its menu once the editor registers its actions.
  await waitFor(() => expect(addMenu).toBeEnabled());
  // Base UI opens the menu on a single click event, as desktop's tests drive it.
  fireEvent.click(addMenu);
  await user.click(await screen.findByRole("menuitem", { name: /新建工作流/ }));
  const dialog = await screen.findByRole("alertdialog", { name: "新建工作流" });
  await user.type(within(dialog).getByLabelText("工作流名称"), name);
  await user.click(within(dialog).getByRole("button", { name: "新建工作流" }));
}

describe("workflow page", () => {
  let server: WorkflowServer;
  beforeEach(async () => {
    window.localStorage.clear();
    server = serve(await sampleWorkflowBackend());
    useUiStore.setState({
      sidebarCollapsed: defaultWorkflowSidebar.collapsed,
      sidebarWidth: defaultWorkflowSidebar.width,
    });
  });

  it("opens on the tenant's workflows from the server", async () => {
    await renderPage();

    for (const name of ["示例：代码审查", "示例：逐段翻译", "循环综合测试：分支与退出"]) {
      expect(await within(library()).findByRole("button", { name })).toBeInTheDocument();
    }
    expect(await screen.findByDisplayValue("示例：代码审查")).toBeInTheDocument();
    expect(await screen.findByText("生效中 · v1")).toBeInTheDocument();
    expect(server.seen).toContain(`GET /api/v2/tenants/${tenantId}/workflows`);
  });

  it("adds the samples only when asked", async () => {
    const user = userEvent.setup();
    server = serve(new LocalWorkflowBackend({ storage: memoryWorkflowStorage() }));
    await renderPage();
    const add = await screen.findByRole("button", { name: "添加样例工作流" });
    expect(within(library()).queryByRole("button", { name: "示例：代码审查" })).not.toBeInTheDocument();

    await user.click(add);

    expect(await within(library()).findByRole("button", { name: "示例：代码审查" })).toBeInTheDocument();
    expect(await screen.findByText("添加了 5 个样例")).toBeInTheDocument();
    expect(server.backend.list().workflows).toHaveLength(5);
  });

  it("says so when the server refuses to publish, and keeps the draft unpublished", async () => {
    const user = userEvent.setup();
    await renderPage();
    await createWorkflow(user, "待发布");
    await screen.findByDisplayValue("待发布");
    server.refuse = {
      match: /POST .*\/publish$/,
      status: 503,
      data: { code: "workflow_domain_unavailable", params: {}, requestId: "r" },
    };

    await user.click(await screen.findByRole("button", { name: "发布" }));
    const dialog = await screen.findByRole("alertdialog", { name: "发布工作流" });
    await user.type(within(dialog).getByRole("textbox"), "v1");
    await user.click(within(dialog).getByRole("button", { name: "发布" }));

    expect(
      await screen.findByText("服务端暂时不能检查和发布工作流，草稿已保存。"),
    ).toBeInTheDocument();
    expect(screen.getByText("暂未发布")).toBeInTheDocument();
  });

  it("offers once to import the workflows this browser kept", async () => {
    const user = userEvent.setup();
    new LocalWorkflowBackend({ storage: browserWorkflowStorage }).create({ name: "本机旧流程", graph: null });
    const first = await renderPage();
    const notice = await screen.findByRole("region", { name: "本机旧工作流" });
    expect(notice).toHaveTextContent("还有 1 个旧的本机工作流");

    await user.click(within(notice).getByRole("button", { name: "导入" }));

    expect(await within(library()).findByRole("button", { name: "本机旧流程" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "本机旧工作流" })).not.toBeInTheDocument();
    first.unmount();
    await renderPage();
    await within(library()).findByRole("button", { name: "本机旧流程" });
    expect(screen.queryByRole("region", { name: "本机旧工作流" })).not.toBeInTheDocument();
  });

  it("resizes the library from its edge and folds it past the minimum, like the chat history", async () => {
    const user = userEvent.setup();
    await renderPage();
    const edge = screen.getByRole("separator", { name: "调整工作流列表宽度" });

    edge.focus();
    await user.keyboard("{ArrowRight}");
    expect(edge).toHaveAttribute("aria-valuenow", "304");
    expect(library()).toHaveStyle({ width: "304px" });

    useUiStore.setState({ sidebarWidth: 200 });
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByRole("complementary", { name: "工作流列表" })).not.toBeInTheDocument();

    // Folded, the editor header offers only the button that shows the library again.
    expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "展开侧边栏" }));
    expect(library()).toHaveStyle({ width: "200px" });
  });

  it("lets every toast be dismissed", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByDisplayValue("示例：代码审查");

    await user.click(await screen.findByRole("button", { name: "整理节点" }));
    const toast = await screen.findByText("已整理工作流节点");
    const item = toast.closest("[data-sonner-toast]") as HTMLElement;
    await user.click(within(item).getByRole("button", { name: "Close toast" }));
    await waitFor(() => expect(toast).not.toBeInTheDocument());
  });

  it("creates a workflow from the library and opens its canvas at the Start node", async () => {
    const user = userEvent.setup();
    await renderPage();

    await createWorkflow(user, "审查流程");

    expect(
      await within(library()).findByRole("button", { name: "审查流程" }),
    ).toBeInTheDocument();
    expect(await screen.findByDisplayValue("审查流程")).toBeInTheDocument();
    const canvas = await screen.findByLabelText("工作流画布");
    expect((await within(canvas).findAllByText("开始")).length).toBeGreaterThan(0);
  });

  it("stops editing the open workflow as soon as another one is picked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByDisplayValue("示例：代码审查");
    // Hold the forced save of the draft being left, the window a fast click used to land in.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const answer = http.defaults.adapter as AxiosAdapter;
    http.defaults.adapter = async (config) => {
      if (config.method?.toUpperCase() === "PUT" && config.url?.endsWith("/draft")) await held;
      return answer(config);
    };

    await user.click(within(library()).getByRole("button", { name: "示例：逐段翻译" }));

    const editor = screen.getByRole("main");
    await waitFor(() => expect(editor).toHaveAttribute("inert"));
    expect(editor).toHaveAttribute("aria-busy", "true");
    release();
    expect(await screen.findByDisplayValue("示例：逐段翻译")).toBeInTheDocument();
    expect(editor).not.toHaveAttribute("inert");
    expect(screen.queryByDisplayValue("示例：代码审查")).not.toBeInTheDocument();
  });

  it("keeps the last workflow picked when two switches overlap their saves", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByDisplayValue("示例：代码审查");
    // Hold every draft write on a per-request gate so the test decides the order in which
    // each switch's flush returns.
    const gates: Array<() => void> = [];
    const answer = http.defaults.adapter as AxiosAdapter;
    http.defaults.adapter = async (config) => {
      if (config.method?.toUpperCase() === "PUT" && config.url?.endsWith("/draft")) {
        await new Promise<void>((resolve) => gates.push(resolve));
      }
      return answer(config);
    };

    // Pick 逐段翻译, then, while its flush is still in flight, pick the loop workflow. The second
    // pick is the one that must win regardless of save resolution order.
    await user.click(within(library()).getByRole("button", { name: "示例：逐段翻译" }));
    const editor = screen.getByRole("main");
    await waitFor(() => expect(editor).toHaveAttribute("inert"));
    expect(gates.length).toBe(1);

    await user.click(within(library()).getByRole("button", { name: "循环综合测试：分支与退出" }));
    // The second pick's flush joins the in-flight save, so only one draft write is outstanding.
    expect(gates.length).toBe(1);
    expect(editor).toHaveAttribute("inert");

    // Let the first pick's save return. Its selection is stale, so it must neither change the
    // selected workflow nor lift the editor's inert; the latest pick starts its own save.
    gates[0]();
    await waitFor(() => expect(gates.length).toBe(2));
    expect(screen.queryByDisplayValue("示例：逐段翻译")).not.toBeInTheDocument();
    expect(editor).toHaveAttribute("inert");

    // Let the latest pick's save return: it owns the switch.
    gates[1]();
    expect(await screen.findByDisplayValue("循环综合测试：分支与退出")).toBeInTheDocument();
    expect(editor).not.toHaveAttribute("inert");
  });

  it("keeps workflows across a reload of the page", async () => {
    const user = userEvent.setup();
    const first = await renderPage();
    await createWorkflow(user, "留存");
    await within(library()).findByRole("button", { name: "留存" });
    first.unmount();

    await renderPage();
    expect(
      await within(library()).findByRole("button", { name: "留存" }),
    ).toBeInTheDocument();
  });
});
