import ElementPlus from "element-plus";
import formCreate from "@form-create/element-ui";
import { registerRuntimeComponents } from "./runtime/register.js";
import "./shared/layout.css";
import "./shared/theme.css";

const installed = new WeakSet();
export function installOnnxComponents(app) {
  if (installed.has(app)) return;
  // JSON controls resolve components by name. The Hub owns their base CSS.
  app.use(ElementPlus);
  app.use(formCreate);
  registerRuntimeComponents(app, formCreate);
  installed.add(app);
}
