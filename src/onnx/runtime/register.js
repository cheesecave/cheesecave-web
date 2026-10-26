import ImageInput from "./components/ImageInput.vue";
import DetectionResult from "./components/DetectionResult.vue";
import ClassificationResult from "./components/ClassificationResult.vue";
import ActionButton from "./components/ActionButton.vue";
import Button from "./components/Button.vue";
import InferenceStatus from "./components/InferenceStatus.vue";
import Heading from "./components/Heading.vue";
import Text from "./components/Text.vue";
import Card from "./components/Card.vue";
import Tabs from "./components/Tabs.vue";
import "./runtime.css";

export const runtimeComponents = {
  ccImageInput: ImageInput,
  ccDetectionResult: DetectionResult,
  ccClassificationResult: ClassificationResult,
  ccActionButton: ActionButton,
  ccButton: Button,
  ccInferenceStatus: InferenceStatus,
  ccHeading: Heading,
  ccText: Text,
  ccCard: Card,
};
export function registerRuntimeComponents(app, formCreate) {
  for (const [name, component] of Object.entries(runtimeComponents)) {
    app.component(name, component);
    formCreate.component(name, component);
  }
  // Scope the named-pane default to JSON forms, not FcDesigner's own UI tabs.
  formCreate.component("elTabs", Tabs);
}
