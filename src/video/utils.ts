export function optional<T, K extends string>(key: K, value: T): Partial<Record<K, T>> {
  return (value !== undefined && value !== null && value !== '' ? { [key]: value } : {}) as Partial<
    Record<K, T>
  >;
}
