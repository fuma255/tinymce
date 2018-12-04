/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Element } from '@ephox/dom-globals';
import { Fun, Merger } from '@ephox/katamari';
import { DOMUtils } from 'tinymce/core/api/dom/DOMUtils';
import { Editor } from 'tinymce/core/api/Editor';
import Env from 'tinymce/core/api/Env';
import { StyleMap } from 'tinymce/core/api/html/Styles';
import InsertTable from '../actions/InsertTable';
import Styles from '../actions/Styles';
import * as Util from '../alien/Util';
import { getTableClassList, hasAdvancedTableTab, hasAppearanceOptions, shouldStyleWithCss, getDefaultAttributes, getDefaultStyles } from '../api/Settings';
import Helpers, { TableData } from './Helpers';
import { Types } from '@ephox/bridge';

// Explore the layers of the table till we find the first layer of tds or ths
const styleTDTH = (dom: DOMUtils, elm: Element, name: string | StyleMap, value?: string | StyleMap) => {
  if (elm.tagName === 'TD' || elm.tagName === 'TH') {
    dom.setStyle(elm, name, value);
  } else {
    if (elm.children) {
      for (let i = 0; i < elm.children.length; i++) {
        styleTDTH(dom, elm.children[i], name, value);
      }
    }
  }
};

const applyDataToElement = (editor: Editor, tableElm, data: TableData) => {
  const dom = editor.dom;
  const attrs: any = {};
  const styles: any = {};

  attrs.class = data.class;

  styles.height = Util.addSizeSuffix(data.height);

  if (dom.getAttrib(tableElm, 'width') && !shouldStyleWithCss(editor)) {
    attrs.width = Util.removePxSuffix(data.width);
  } else {
    styles.width = Util.addSizeSuffix(data.width);
  }

  if (shouldStyleWithCss(editor)) {
    styles['border-width'] = Util.addSizeSuffix(data.border);
    styles['border-spacing'] = Util.addSizeSuffix(data.cellspacing);
  } else {
    attrs.border = data.border;
    attrs.cellpadding = data.cellpadding;
    attrs.cellspacing = data.cellspacing;
  }

  // TODO: this has to be reworked somehow, for example by introducing dedicated option, which
  // will control whether child TD/THs should be processed or not
  if (shouldStyleWithCss(editor) && tableElm.children) {
    for (let i = 0; i < tableElm.children.length; i++) {
      styleTDTH(dom, tableElm.children[i], {
        'border-width': Util.addSizeSuffix(data.border),
        'padding': Util.addSizeSuffix(data.cellpadding),
      });
      if (hasAdvancedTableTab(editor)) {
        styleTDTH(dom, tableElm.children[i], {
          'border-color': data.bordercolor,
        });
      }
    }
  }

  if (hasAdvancedTableTab(editor)) {
    styles['background-color'] = data.backgroundcolor;
    styles['border-color'] = data.bordercolor;
    styles['border-style'] = data.borderstyle;
  }

  attrs.style = dom.serializeStyle(Merger.merge(getDefaultStyles(editor), styles));
  dom.setAttribs(tableElm, Merger.merge(getDefaultAttributes(editor), attrs));
};

const onSubmitTableForm = (editor: Editor, tableElm, api: Types.Dialog.DialogInstanceApi<TableData>) => {
  const dom = editor.dom;
  let captionElm;
  const data = api.getData();

  api.close();

  if (data.class === '') {
    delete data.class;
  }

  editor.undoManager.transact(() => {
    if (!tableElm) {
      // Should this be parseInt instead of pretending?
      const cols = (data.cols || '1') as unknown as number;
      const rows = (data.rows || '1') as unknown as number;
      // Cases 1 & 3 - inserting a table
      tableElm = InsertTable.insert(editor, cols, rows);
    }

    applyDataToElement(editor, tableElm, data);

    // Toggle caption on/off
    captionElm = dom.select('caption', tableElm)[0];

    if (captionElm && data.caption !== 'checked') {
      dom.remove(captionElm);
    }

    if (!captionElm && data.caption === 'checked') {
      captionElm = dom.create('caption');
      captionElm.innerHTML = !Env.ie ? '<br data-mce-bogus="1"/>' : '\u00a0';
      tableElm.insertBefore(captionElm, tableElm.firstChild);
    }

    if (data.align === '') {
      Styles.unApplyAlign(editor, tableElm);
    } else {
      Styles.applyAlign(editor, tableElm, data.align);
    }

    editor.focus();
    editor.addVisual();
  });
};

const open = (editor: Editor, isNew?: boolean) => {
  const dom = editor.dom;
  let tableElm;
  let data = Helpers.extractDataFromSettings(editor, hasAdvancedTableTab(editor));

  // Cases for creation/update of tables:
  // 1. isNew == true - called by mceInsertTable - we are inserting a new table so we don't care what the selection's parent is,
  //    and we need to add cols and rows input fields to the dialog
  // 2. isNew == false && selection parent is a table - update the table
  // 3. isNew == false && selection parent isn't a table - open dialog with default values and insert a table

  if (isNew === false) {
    tableElm = dom.getParent(editor.selection.getStart(), 'table');
    if (tableElm) {
      // Case 2 - isNew == false && table parent
      data = Helpers.extractDataFromTableElement(editor, tableElm, hasAdvancedTableTab(editor));
    } else {
      // Case 3 - isNew == false && non-table parent. data is set to basic defaults so just add the adv properties if needed
      if (hasAdvancedTableTab(editor)) {
        data.borderstyle = '';
        data.bordercolor = '';
        data.backgroundcolor = '';
      }
    }
  } else {
    // Case 1 - isNew == true. We're inserting a new table so use defaults and add cols and rows + adv properties.
    data.cols = '1';
    data.rows = '1';
    if (hasAdvancedTableTab(editor)) {
      data.borderstyle = '';
      data.bordercolor = '';
      data.backgroundcolor = '';
    }
  }

  const hasClasses = getTableClassList(editor).length > 0;

  if (hasClasses) {
    if (data.class) {
      data.class = data.class.replace(/\s*mce\-item\-table\s*/g, '');
    }
  }

  const rowColCountItems: Types.Dialog.BodyComponentApi[] = !isNew ? [] : [
    {
      type: 'input',
      name: 'cols',
      label: 'Cols'
    },
    {
      type: 'input',
      name: 'rows',
      label: 'Rows'
    }
  ];

  const alwaysItems: Types.Dialog.BodyComponentApi[] = [
    {
      type: 'input',
      name: 'width',
      label: 'Width'
    },
    {
      type: 'input',
      name: 'height',
      label: 'Height'
    }
  ];

  const appearanceItems: Types.Dialog.BodyComponentApi[] = hasAppearanceOptions(editor) ? [
    {
      type: 'input',
      name: 'cellspacing',
      label: 'Cell spacing'
    },
    {
      type: 'input',
      name: 'cellpadding',
      label: 'Cell padding'
    },
    {
      type: 'input',
      name: 'border',
      label: 'Border width'
    },
    {
      type: 'label',
      label: 'Caption',
      items: [
        {
          type: 'checkbox',
          name: 'caption',
          label: 'Show caption'
        }
      ]
    }
  ] : [];

  const alignmentItem: Types.Dialog.BodyComponentApi[] = [
    {
      type: 'selectbox',
      name: 'align',
      label: 'Alignment',
      items: [
        { text: 'None', value: '' },
        { text: 'Left', value: 'left' },
        { text: 'Center', value: 'center' },
        { text: 'Right', value: 'right' }
      ]
    }
  ];

  const classListItem: Types.Dialog.BodyComponentApi[] = hasClasses ? [
    {
      type: 'selectbox',
      name: 'class',
      label: 'Class',
      items: Helpers.buildListItems(
        getTableClassList(editor),
        (item) => {
          if (item.value) {
            item.textStyle = () => {
              return editor.formatter.getCssText({ block: 'table', classes: [item.value] });
            };
          }
        }
      )
    }
  ] : [];

  const generalTabItems = rowColCountItems.concat(alwaysItems).concat(appearanceItems).concat(alignmentItem).concat(classListItem);

  const generalPanel: Types.Dialog.BodyComponentApi = {
    type: 'grid',
    columns: 2,
    items: generalTabItems
  };

  const nonAdvancedForm: Types.Dialog.PanelApi = {
    type: 'panel',
    items: [ generalPanel ]
  };

  const advancedForm: Types.Dialog.TabPanelApi = {
    type: 'tabpanel',
    tabs: [
      {
        title: 'General',
        items: [ generalPanel ]
      },
      Helpers.getAdvancedTab()
    ]
  };

  const dialogBody = hasAdvancedTableTab(editor) ? advancedForm : nonAdvancedForm;

  editor.windowManager.open({
    title: 'Table Properties',
    size: 'normal',
    body: dialogBody,
    onSubmit: Fun.curry(onSubmitTableForm, editor, tableElm),
    buttons: [
      {
        type: 'cancel',
        name: 'cancel',
        text: 'Cancel',
      },
      {
        type: 'submit',
        name: 'save',
        text: 'Save',
        primary: true
      }
    ],
    initialData: data
  });
};

export default {
  open
};