import path from "node:path";
export const dataDirectory = () => {
  const namespace = process.env.FOUNDIT_DEMO_NAMESPACE || "";
  if (!/^[a-zA-Z0-9_-]*$/.test(namespace))
    throw Error("Invalid demo data namespace");
  return path.join(process.cwd(), ".data", namespace);
};
