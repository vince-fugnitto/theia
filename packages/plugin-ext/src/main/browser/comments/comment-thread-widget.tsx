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
import { MonacoEditorZoneWidget } from '@theia/monaco/lib/browser/monaco-editor-zone-widget';
import { Comment, CommentThread, CommentThreadCollapsibleState } from '../../../common/plugin-api-rpc-model';
import { CommentGlyphWidget } from './comment-glyph-widget';
import { BaseWidget } from '@theia/core/lib/browser';
import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { MouseTargetType } from '@theia/editor/lib/browser';

export class ReviewZoneWidget extends BaseWidget {

    protected _headingLabel: HTMLElement;
    protected zoneWidget: MonacoEditorZoneWidget;
    protected commentGlyphWidget: CommentGlyphWidget;

    public getGlyphPosition(): number {
        // if (this._commentGlyph) {
        // return this._commentGlyph.getPosition().position!.lineNumber;
        // }
        return 0;
    }

    constructor(
        editor: monaco.editor.IStandaloneCodeEditor,
        private _owner: string,
        private _commentThread: CommentThread
    ) {
        super();
        this.toDispose.push(this.zoneWidget = new MonacoEditorZoneWidget(editor));
        this.zoneWidget.editor.onMouseDown(e => this.onEditorMouseDown(e));
        this.commentGlyphWidget = new CommentGlyphWidget(editor);
        // this._fillContainer(this.zone.containerNode);
        // this.createThreadLabel();
    }

    // @postConstruct()
    // protected init(): void {
    //     this.render();
    // }

    protected render(): void {
        const headHeight = Math.ceil(this.zoneWidget.editor.getOption(monaco.editor.EditorOption.lineHeight) * 1.2);
        ReactDOM.render(<div className={'review-widget'}>
            <div className={'head'} style={{ height: headHeight, lineHeight: `${headHeight}px`}}>
                <div className={'review-title'}>
                    <span className={'filename'}>{this.getThreadLabel()}</span>
                </div>
                <div className={'review-actions'}>
                    <div className={'monaco-action-bar animated'}>
                        <ul className={'actions-container'} role={'toolbar'}>
                            <li className={'action-item'} role={'presentation'}>
                                <a className={'action-label codicon expand-review-action codicon-chevron-up'}
                                   role={'button'}
                                   tabIndex={0}
                                   title={'Collapse'}
                                   onClick={() => this.hide()}
                                />
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className={'body'}>
                <div className={'comments-container'} role={'presentation'} tabIndex={0}>
                    {this.commentThread.comments?.map(comment => <ThreadElements comment={comment}/> )}
                </div>
            </div>
        </div>, this.zoneWidget.containerNode);
    }

    hide(): void {
        this.commentThread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
        this.zoneWidget.hide();
        super.hide();
    }

    display(options: MonacoEditorZoneWidget.Options): void {
        if (this._commentThread.collapsibleState && this._commentThread.collapsibleState !== CommentThreadCollapsibleState.Expanded) {
            return;
        }
        this.commentGlyphWidget.setLineNumber(options.afterLineNumber);
        this.commentThread.collapsibleState = CommentThreadCollapsibleState.Expanded;
        this.zoneWidget.show(options);
        this.update();
    }

    private onEditorMouseDown(e: monaco.editor.IEditorMouseEvent): void {
        const range = e.target.range;

        if (!range) {
            return;
        }

        if (!e.event.leftButton) {
            return;
        }

        if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
            return;
        }

        const data = e.target.detail;
        const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;

        // don't collide with folding and git decorations
        if (gutterOffsetX > 14) {
            return;
        }

        const mouseDownInfo = { lineNumber: range.startLineNumber };

        const { lineNumber } = mouseDownInfo;

        if (!range || range.startLineNumber !== lineNumber) {
            return;
        }

        if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
            return;
        }

        if (!e.target.element) {
            return;
        }

        // if (this.commentGlyphWidget && this.commentGlyphWidget.getPosition().position!.lineNumber !== lineNumber) {
        //     return;
        // }
        //
        // if (e.target.element.className.indexOf('comment-thread') >= 0) {
        //     this.toggleExpand(lineNumber);
        // }

        if (this.commentThread.collapsibleState === CommentThreadCollapsibleState.Collapsed) {
            this.display({ afterLineNumber: mouseDownInfo.lineNumber, heightInLines: 2 });
        } else {
            this.hide();
        }
    }

    public get owner(): string {
        return this._owner;
    }

    public get commentThread(): CommentThread {
        return this._commentThread;
    }

    private getThreadLabel(): string {
        let label: string | undefined;
        label = this._commentThread.label;

        if (label === undefined) {
            if (this._commentThread.comments && this._commentThread.comments.length) {
                const onlyUnique = (value: Comment, index: number, self: Comment[]) => self.indexOf(value) === index;
                const participantsList = this._commentThread.comments.filter(onlyUnique).map(comment => `@${comment.userName}`).join(', ');
                label = `Participants: ${participantsList}`;
            } else {
                label = 'Start discussion';
            }
        }

        // if (label) {
        //     this._headingLabel.innerHTML = label;
        //     this._headingLabel.setAttribute('aria-label', label);
        // }

        return label;
    }

    protected setCssClass(className: string, classToReplace?: string): void {
        if (!this.zoneWidget.containerNode) {
            return;
        }

        if (classToReplace) {
            this.zoneWidget.containerNode.classList.remove(classToReplace);
        }

        this.zoneWidget.containerNode.classList.add(className);
    }

    update(): void {
        this.render();
        const headHeight = Math.ceil(this.zoneWidget.editor.getOption(monaco.editor.EditorOption.lineHeight) * 1.2);
        const lineHeight = this.zoneWidget.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const arrowHeight = Math.round(lineHeight / 3);
        const frameThickness = Math.round(lineHeight / 9) * 2;
        const body = this.zoneWidget.containerNode.getElementsByClassName('body')[0];

        const computedLinesNumber = Math.ceil((headHeight + body.clientHeight + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */) / lineHeight);
        this.zoneWidget.show({ afterLineNumber: this.commentThread.range.startLineNumber, heightInLines: computedLinesNumber });
    }
}

namespace ThreadElements {
    export interface Props  {
        comment: Comment;
    }
}

export class ThreadElements extends React.Component<ThreadElements.Props> {
    render(): React.ReactNode {
        const comment = this.props.comment;
        return <div className={'review-comment'} tabIndex={-1} aria-label={`${comment.userName}, ${comment.body.value}`}>
            <div className={'avatar-container'}>
                <img className={'avatar'} src={comment.userIconPath}/>
            </div>
            <div className={'review-comment-contents'}>
                <div className={'comment-title monaco-mouse-cursor-text'}>
                    <strong className={'author'}>{comment.userName}</strong>
                    <span className={'isPending'}/>
                </div>
            </div>
        </div>;
    }
}
