import { defineComponent, h, ref } from "vue";
import { ElementPlusStubs } from "./vue";

// Exercise the supplied production rules rather than the generic form stub's
// always-valid response. Keep the same Element Plus callback contract.
export const CreationFormStub = defineComponent({
  name: "ElForm",
  props: ElementPlusStubs.ElForm.props,
  setup(props, { expose, slots }) {
    const error = ref("");
    expose({
      validate(callback) {
        error.value = "";
        for (const [field, rules] of Object.entries(props.rules)) {
          for (const rule of rules) {
            if (rule.validator) {
              rule.validator(rule, props.model[field], (failure) => {
                if (failure) error.value ||= failure.message;
              });
            } else if (rule.required && !props.model[field]) {
              error.value ||= rule.message;
            }
          }
        }
        const valid = !error.value;
        callback?.(valid);
        return Promise.resolve(valid);
      },
    });
    return () =>
      h("form", { "data-el-form": "true" }, [
        slots.default?.(),
        error.value
          ? h(
              "div",
              { role: "alert", "data-validation-error": "true" },
              error.value,
            )
          : null,
      ]);
  },
});
