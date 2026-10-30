// A JSON column as the stores read it: mysql2 hands back a string or an already parsed value depending on the column
// type; what cannot be read becomes the fallback instead of an error, so one damaged row never breaks a whole list.
export const jsonColumn = (value, fallback) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : (value ?? fallback);
  } catch {
    return fallback;
  }
};
