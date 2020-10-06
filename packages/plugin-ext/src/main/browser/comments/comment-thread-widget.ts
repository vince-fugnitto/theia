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
import { Comment, CommentThread } from '../../../common/plugin-api-rpc-model';

export class ReviewZoneWidget extends MonacoEditorZoneWidget {

    private _headElement: HTMLElement;
    private _bodyElement: HTMLElement;
    protected _headingLabel: HTMLElement;

    public getGlyphPosition(): number {
		// if (this._commentGlyph) {
		// 	return this._commentGlyph.getPosition().position!.lineNumber;
		// }
		return 0;
	}

    constructor(
		editor: monaco.editor.IStandaloneCodeEditor,
        private _owner: string,
        private _commentThread: CommentThread
	) {
		super(editor);
		this._headElement = document.createElement('div');
		this._bodyElement = document.createElement('div');
        this._fillContainer(this.containerNode);
	}

    public get owner(): string {
        return this._owner;
    }

    public get commentThread(): CommentThread {
        return this._commentThread;
    }

    protected _fillContainer(container: HTMLElement): void {
        this.setCssClass('review-widget');
        this._headElement.classList.add('head');
        container.appendChild(this._headElement);
        this._fillHead(this._headElement);

        this._bodyElement.classList.add('body');
        container.appendChild(this._bodyElement);

        // dom.addDisposableListener(this._bodyElement, dom.EventType.FOCUS_IN, e => {
        //     this.commentService.setActiveCommentThread(this._commentThread);
        // });
    }

    protected _fillHead(container: HTMLElement): void {
        // const titleElement = dom.append(this._headElement, dom.$('.review-title'));
        const titleElement = document.createElement('div');
        titleElement.classList.add('review-title');
        this._headElement.appendChild(titleElement);

        // this._headingLabel = dom.append(titleElement, dom.$('span.filename'));
        this._headingLabel = document.createElement('span');
        this._headingLabel.classList.add('filename');
        titleElement.appendChild(this._headingLabel);

        this.createThreadLabel();

        // const actionsContainer = dom.append(this._headElement, dom.$('.review-actions'));
        // this._actionbarWidget = new ActionBar(actionsContainer, {
        //     actionViewItemProvider: (action: IAction) => {
        //         if (action instanceof MenuItemAction) {
        //             return this.instantiationService.createInstance(MenuEntryActionViewItem, action);
        //         } else if (action instanceof SubmenuItemAction) {
        //             return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action);
        //         } else {
        //             return new ActionViewItem({}, action, { label: false, icon: true });
        //         }
        //     }
        // });
        //
        // this._disposables.add(this._actionbarWidget);
        //
        // this._collapseAction = new Action('review.expand', nls.localize('label.collapse', "Collapse"), COLLAPSE_ACTION_CLASS, true, () => this.collapse());
        //
        // const menu = this._commentMenus.getCommentThreadTitleActions(this._commentThread, this._contextKeyService);
        // this.setActionBarActions(menu);
        //
        // this._disposables.add(menu);
        // this._disposables.add(menu.onDidChange(e => {
        //     this.setActionBarActions(menu);
        // }));
        //
        // this._actionbarWidget.context = this._commentThread;
    }

    private createThreadLabel(): void {
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

        if (label) {
            this._headingLabel.innerHTML = label;
            this._headingLabel.setAttribute('aria-label', label);
        }
    }

    protected setCssClass(className: string, classToReplace?: string): void {
        if (!this.containerNode) {
            return;
        }

        if (classToReplace) {
            this.containerNode.classList.remove(classToReplace);
        }

        this.containerNode.classList.add(className);

    }

    async update(commentThread: CommentThread): Promise<void> {
        // const oldCommentsLen = this._commentElements.length;
        // const newCommentsLen = commentThread.comments ? commentThread.comments.length : 0;
        // this._threadIsEmpty.set(!newCommentsLen);
        //
        // let commentElementsToDel: CommentNode[] = [];
        // let commentElementsToDelIndex: number[] = [];
        // for (let i = 0; i < oldCommentsLen; i++) {
        //     let comment = this._commentElements[i].comment;
        //     let newComment = commentThread.comments ? commentThread.comments.filter(c => c.uniqueIdInThread === comment.uniqueIdInThread) : [];
        //
        //     if (newComment.length) {
        //         this._commentElements[i].update(newComment[0]);
        //     } else {
        //         commentElementsToDelIndex.push(i);
        //         commentElementsToDel.push(this._commentElements[i]);
        //     }
        // }
        //
        // // del removed elements
        // for (let i = commentElementsToDel.length - 1; i >= 0; i--) {
        //     this._commentElements.splice(commentElementsToDelIndex[i], 1);
        //     this._commentsElement.removeChild(commentElementsToDel[i].domNode);
        // }
        //
        // let lastCommentElement: HTMLElement | null = null;
        // let newCommentNodeList: CommentNode[] = [];
        // let newCommentsInEditMode: CommentNode[] = [];
        // for (let i = newCommentsLen - 1; i >= 0; i--) {
        //     let currentComment = commentThread.comments![i];
        //     let oldCommentNode = this._commentElements.filter(commentNode => commentNode.comment.uniqueIdInThread === currentComment.uniqueIdInThread);
        //     if (oldCommentNode.length) {
        //         lastCommentElement = oldCommentNode[0].domNode;
        //         newCommentNodeList.unshift(oldCommentNode[0]);
        //     } else {
        //         const newElement = this.createNewCommentNode(currentComment);
        //
        //         newCommentNodeList.unshift(newElement);
        //         if (lastCommentElement) {
        //             this._commentsElement.insertBefore(newElement.domNode, lastCommentElement);
        //             lastCommentElement = newElement.domNode;
        //         } else {
        //             this._commentsElement.appendChild(newElement.domNode);
        //             lastCommentElement = newElement.domNode;
        //         }
        //
        //         if (currentComment.mode === modes.CommentMode.Editing) {
        //             newElement.switchToEditMode();
        //             newCommentsInEditMode.push(newElement);
        //         }
        //     }
        // }
        //
        // this._commentThread = commentThread;
        // this._commentElements = newCommentNodeList;
        this.createThreadLabel();

        // // Move comment glyph widget and show position if the line has changed.
        // const lineNumber = this._commentThread.range.startLineNumber;
        // let shouldMoveWidget = false;
        // if (this._commentGlyph) {
        //     if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
        //         shouldMoveWidget = true;
        //         this._commentGlyph.setLineNumber(lineNumber);
        //     }
        // }
        //
        // if (!this._reviewThreadReplyButton) {
        //     this.createReplyButton();
        // }
        //
        // if (this._commentThread.comments && this._commentThread.comments.length === 0) {
        //     this.expandReplyArea();
        // }
        //
        // if (shouldMoveWidget && this._isExpanded) {
        //     this.show({ lineNumber, column: 1 }, 2);
        // }
        //
        // if (this._commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded) {
        //     this.show({ lineNumber, column: 1 }, 2);
        // } else {
        //     this.hide();
        // }
        //
        // if (this._commentThread.contextValue) {
        //     this._commentThreadContextValue.set(this._commentThread.contextValue);
        // } else {
        //     this._commentThreadContextValue.reset();
        // }
        //
        // if (newCommentsInEditMode.length) {
        //     const lastIndex = this._commentElements.indexOf(newCommentsInEditMode[newCommentsInEditMode.length - 1]);
        //     this._focusedComment = lastIndex;
        // }
        //
        // this.setFocusedComment(this._focusedComment);
    }
}
