export const text = (body, key, max = 1024) => {
  const value = body[key];
  return typeof value === "string" && value.length <= max ? value : undefined;
};
