import formCreate from '@form-create/element-ui';
import FcTitle from '../components/FcTitle.vue';
import SignaturePad from '../components/SignaturePad.vue';
import TableForm from '../components/tableForm/TableForm.vue';
import Table from '../components/table/Table.vue';
import '../style/icon.css';

const install = (formCreate) => {
    formCreate.component('FcTitle', FcTitle);
    formCreate.component('SignaturePad', SignaturePad);
    formCreate.component('TableForm', TableForm);
    formCreate.component('FcTable', Table);
}

install(formCreate);

export default install;
