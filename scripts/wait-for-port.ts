export {};

const [host = "127.0.0.1", ...ports] = process.argv.slice(2);
const deadline = Date.now() + 60_000;

for (const port of ports.map(Number)) {
  while (true) {
    const open = await Bun.connect({ hostname: host, port, socket: { data() {} } }).then(
      (socket) => {
        socket.end();
        return true;
      },
      () => false,
    );
    if (open) break;
    if (Date.now() > deadline) {
      console.error(`Timed out waiting for ${host}:${port}`);
      process.exit(1);
    }
    await Bun.sleep(500);
  }
  console.log(`${host}:${port} is ready`);
}
