// The two Bun APIs this CLI uses, declared rather than installed. `@types/bun`
// would be a devDependency and a lockfile move for a build call and a write.
declare global {
  interface BunBuildOutput {
    readonly path: string;
    readonly kind: string;
  }

  interface BunBuildResult {
    readonly success: boolean;
    readonly outputs: readonly BunBuildOutput[];
    readonly logs: readonly unknown[];
  }

  interface BunBuildConfig {
    readonly entrypoints: readonly string[];
    readonly outdir?: string;
    readonly target?: "browser" | "bun" | "node";
    readonly format?: "esm";
    readonly splitting?: boolean;
    readonly throw?: boolean;
    readonly minify?: boolean;
    // Compile-time substitution. Without it `process.env.NODE_ENV` survives into
    // the bundle, and every library that branches on it in its `exports` — React
    // and react-dom among them — resolves to its development build.
    readonly define?: Readonly<Record<string, string>>;
    readonly naming?: Readonly<Record<string, string>>;
  }

  const Bun: {
    build(config: BunBuildConfig): Promise<BunBuildResult>;
    write(path: string, data: string | Uint8Array): Promise<number>;
    resolveSync(specifier: string, parent: string): string;
  };
}

export {};
