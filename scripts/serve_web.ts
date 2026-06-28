const port = Number(Deno.env.get("PORT") ?? "8765");
const root = new URL("../dist/", import.meta.url);

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

Deno.serve({ port }, async (request) => {
  const url = new URL(request.url);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const fileUrl = new URL(`.${pathname}`, root);

  if (!fileUrl.href.startsWith(root.href)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = await Deno.readFile(fileUrl);
    return new Response(file, {
      headers: {
        "content-type": contentTypes[extension(fileUrl.pathname)] ?? "application/octet-stream",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
});

console.log(`Elite TUI web serving at http://127.0.0.1:${port}/`);

function extension(pathname: string): string {
  const index = pathname.lastIndexOf(".");
  return index === -1 ? "" : pathname.slice(index).toLowerCase();
}
