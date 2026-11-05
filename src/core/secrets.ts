export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export function keychainStore(service: string): SecretStore {
  return {
    get: (name) => Bun.secrets.get({ service, name }),
    set: (name, value) => Bun.secrets.set({ service, name, value }),
    delete: async (name) => {
      await Bun.secrets.delete({ service, name });
    },
  };
}

export function memoryStore(): SecretStore {
  const values = new Map<string, string>();
  return {
    get: async (name) => values.get(name) ?? null,
    set: async (name, value) => {
      values.set(name, value);
    },
    delete: async (name) => {
      values.delete(name);
    },
  };
}
