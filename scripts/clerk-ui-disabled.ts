// This extension authenticates only through Sync Host and background:true.
// The SDK's unused DOM-client branch otherwise imports the entire wallet/UI graph.
// Fail loudly if a future SDK change attempts to initialize that unsupported path.
throw new Error(
  "PixOnDeck uses Clerk Sync Host only; embedded Clerk UI is not included.",
);
export const ui = undefined;
