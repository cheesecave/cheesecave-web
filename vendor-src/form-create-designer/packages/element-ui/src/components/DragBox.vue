<script>
import {defineComponent, h} from 'vue';
import draggable from 'vuedraggable/src/vuedraggable';

// A drag handle wraps the real rule. Its grid footprint must stay on the
// draggable item, otherwise every item becomes a full row while only the
// control nested inside it receives rule.col. Keep the saved rule unchanged.
function layoutClasses(element) {
    const rule = element?.type === 'DragTool' ? element.children?.[0] : element;
    if (!rule || (!rule.field && !rule.col)) return ['cc-design-block'];
    const col = rule.col || {};
    const classes = ['cc-design-column', 'el-col', `el-col-${col.span ?? 24}`];
    if (col.offset) classes.push(`el-col-offset-${col.offset}`);
    ['xs', 'sm', 'md', 'lg', 'xl'].forEach(size => {
        const value = col[size];
        if (typeof value === 'number') classes.push(`el-col-${size}-${value}`);
        else if (value && typeof value === 'object') {
            if (value.span != null) classes.push(`el-col-${size}-${value.span}`);
            if (value.offset != null) classes.push(`el-col-${size}-offset-${value.offset}`);
        }
    });
    return classes;
}

export default defineComponent({
    name: 'DragBox',
    props: ['rule', 'tag', 'formCreateInject', 'list'],
    render(ctx) {
        const attrs = {...ctx.$props.rule.props, ...ctx.$attrs};
        let _class = '_fd-' + ctx.$props.tag + '-drag _fd-drag-box';
        if (!Object.keys(ctx.$slots).length) {
            _class += ' drag-holder';
        }
        attrs.class = _class;
        attrs.modelValue = ctx.$props.list || [...ctx.$props.formCreateInject.children];

        const keys = {};
        if (ctx.$slots.default) {
            const children = ctx.$slots.default();
            children.forEach(v => {
                if (v.key) {
                    keys[v.key] = v;
                }
            })
        }
        return h(draggable, attrs, {
            item: ({element, index}) => {
                const key = element?.__fc__?.key;
                if (key) {
                    let vnode = keys['_' + element.slot];
                    if (vnode) {
                        vnode.children.forEach(v => {
                            if (v.key === key + 'fc') {
                                vnode = v
                            }
                        });
                    } else {
                        vnode = keys[key + 'fc'];
                    }
                    if (vnode) {
                        return h('div', {class: ['_fc-' + ctx.$props.tag + '-item _fd-drag-item', ...layoutClasses(element)], key}, vnode);
                    }
                }
                return h('div', {class: '_fc-' + ctx.$props.tag + '-item _fd-drag-item', key: index}, null);
            }
        });
    }
});
</script>
