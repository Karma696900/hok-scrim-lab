export const wording = error => String(error?.message ?? error).slice(0, 200);
