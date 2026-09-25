export function createAuthSync(options: { onChange: (user: unknown) => unknown }) {
  let signedOut = false;
  const user = { id: "preview-user", email: "preview@pixondeck.local", name: "Preview", imageUrl: "/icon.png" };
  return { start: async () => { await options.onChange(user); }, refresh: async () => { await options.onChange(signedOut ? null : user); }, signOut: async () => { signedOut = true; await options.onChange(null); }, getUser: () => signedOut ? null : user, getToken: async () => signedOut ? null : "preview-only", dispose() {} };
}
