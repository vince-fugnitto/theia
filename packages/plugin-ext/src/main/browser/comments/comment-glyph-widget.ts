/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

export class CommentGlyphWidget {

    // private _lineNumber!: number;
    private editor: monaco.editor.ICodeEditor;
    private commentsDecorations: string[] = [];
    private _commentsOptions: monaco.editor.IModelDecorationOptions;
    constructor(editor: monaco.editor.ICodeEditor, lineNumber: number) {
        this._commentsOptions = this.createDecorationOptions();
        this.editor = editor;
        this.setLineNumber(lineNumber);
    }

    private createDecorationOptions(): monaco.editor.IModelDecorationOptions {
        return  {
            isWholeLine: true,
            linesDecorationsClassName: 'comment-range-glyph comment-thread'
        };
    }

    setLineNumber(lineNumber: number): void {
        // this._lineNumber = lineNumber;
        const commentsDecorations = [{
            range: {
                startLineNumber: lineNumber, startColumn: 1,
                endLineNumber: lineNumber, endColumn: 1
            },
            options: this._commentsOptions
        }];

        this.commentsDecorations = this.editor.deltaDecorations(this.commentsDecorations, commentsDecorations);
    }
}
