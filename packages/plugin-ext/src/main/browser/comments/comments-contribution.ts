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

import { inject, injectable } from 'inversify';
import { CommentingRangeDecorator } from './comments-decorator';
import { EditorManager, EditorMouseEvent, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { ReviewZoneWidget } from './comment-thread-widget';
import { CommentsService, ICommentInfo } from './comments-service';
import { CommentThread } from '../../../common/plugin-api-rpc-model';

@injectable()
export class CommentsContribution {

    // private mouseDownInfo: { lineNumber: number } | undefined;
    private _addInProgress!: boolean;
    private _commentWidgets: ReviewZoneWidget[];
    private _commentInfos: ICommentInfo[];
    private _pendingCommentCache: { [key: string]: { [key: string]: string } };
    private _emptyThreadsToAddQueue: [number, EditorMouseEvent | undefined][] = [];
    private _computePromise: Promise<Array<ICommentInfo | null>> | undefined;

    constructor(@inject(CommentingRangeDecorator) protected readonly rangeDecorator: CommentingRangeDecorator,
                @inject(CommentsService) protected readonly commentService: CommentsService,
                @inject(EditorManager) protected readonly editorManager: EditorManager) {
        this._commentWidgets = [];
        this._pendingCommentCache = {};
        this._commentInfos = [];
        this.commentService.onDidSetResourceCommentInfos(e => {
            const editor = this.getCurrentEditor();
            const editorURI = editor && editor.editor instanceof MonacoDiffEditor && editor.editor.diffEditor.getModifiedEditor().getModel();
            if (editorURI && editorURI.toString() === e.resource.toString()) {
                this.setComments(e.commentInfos.filter(commentInfo => commentInfo !== null));
            }
        });
        this.editorManager.onCreated(async widget => {
            const editor = widget.editor;
            if (editor instanceof MonacoDiffEditor) {
                const originalEditorModel = editor.diffEditor.getOriginalEditor().getModel();
                if (originalEditorModel) {
                    const originalComments = await this.commentService.getComments(originalEditorModel.uri);
                    if (originalComments) {
                        this.rangeDecorator.update(editor.diffEditor.getOriginalEditor(), <ICommentInfo[]>originalComments.filter(c => !!c));
                    }
                }
                const modifiedEditorModel = editor.diffEditor.getModifiedEditor().getModel();
                if (modifiedEditorModel) {
                    const modifiedComments = await this.commentService.getComments(modifiedEditorModel.uri);
                    if (modifiedComments) {
                        this.rangeDecorator.update(editor.diffEditor.getModifiedEditor(), <ICommentInfo[]>modifiedComments.filter(c => !!c));
                    }
                }
                const toDispose = editor.onMouseDown(event => this.onEditorMouseDown(event));
                editor.onDispose(() => {
                    toDispose.dispose();
                });
                this.beginCompute();
            }
            this.commentService.onDidUpdateCommentThreads(async e => {
                const editorModel = this.editor && this.editor.getModel();
                const editorURI = this.editor && editorModel && editorModel.uri;
                if (!editorURI) {
                    return;
                }

                if (this._computePromise) {
                    await this._computePromise;
                }

                const commentInfo = this._commentInfos.filter(info => info.owner === e.owner);
                if (!commentInfo || !commentInfo.length) {
                    return;
                }

                const added = e.added.filter(thread => thread.resource && thread.resource.toString() === editorURI.toString());
                const removed = e.removed.filter(thread => thread.resource && thread.resource.toString() === editorURI.toString());
                const changed = e.changed.filter(thread => thread.resource && thread.resource.toString() === editorURI.toString());

                removed.forEach(thread => {
                    // const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner
                    //     && zoneWidget.commentThread.threadId === thread.threadId && zoneWidget.commentThread.threadId !== '');
                    // if (matchedZones.length) {
                    //     const matchedZone = matchedZones[0];
                    //     const index = this._commentWidgets.indexOf(matchedZone);
                    //     this._commentWidgets.splice(index, 1);
                    //     matchedZone.dispose();
                    // }
                });

                changed.forEach(thread => {
                    const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner
                        && zoneWidget.commentThread.threadId === thread.threadId);
                    if (matchedZones.length) {
                        const matchedZone = matchedZones[0];
                        matchedZone.update(thread);
                    }
                });
                added.forEach(thread => {
                    // const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner
                    //     && zoneWidget.commentThread.threadId === thread.threadId);
                    // if (matchedZones.length) {
                    //     return;
                    // }
                    //
                    // const matchedNewCommentThreadZones = this._commentWidgets.filter(zoneWidget => zoneWidget.owner === e.owner
                    //     && (zoneWidget.commentThread as any).commentThreadHandle === -1 && Range.equalsRange(zoneWidget.commentThread.range, thread.range));
                    //
                    // if (matchedNewCommentThreadZones.length) {
                    //     matchedNewCommentThreadZones[0].update(thread);
                    //     return;
                    // }

                    const pendingCommentText = this._pendingCommentCache[e.owner] && this._pendingCommentCache[e.owner][thread.threadId!];
                    this.displayCommentThread(e.owner, thread, pendingCommentText);
                    this._commentInfos.filter(info => info.owner === e.owner)[0].threads.push(thread);
                });
            });
        });
    }

    private async beginCompute(): Promise<void> {
        const editorModel = this.editor && this.editor.getModel();
        const editorURI = this.editor && editorModel && editorModel.uri;
        if (editorURI) {
            const comments = await this.commentService.getComments(editorURI);
            this.setComments(<ICommentInfo[]>comments.filter(c => !!c));
        }
        // this._computePromise = createCancelablePromise(token => {
        //     const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
        //
        //     if (editorURI) {
        //         return this.commentService.getComments(editorURI);
        //     }
        //
        //     return Promise.resolve([]);
        // });
        //
        // return this._computePromise.then(commentInfos => {
        //     this.setComments(coalesce(commentInfos));
        //     this._computePromise = null;
        // }, error => console.log(error));
    }

    private setComments(commentInfos: ICommentInfo[]): void {
        // if (!this.editor) {
        //     return;
        // }

        this._commentInfos = commentInfos;
        // let lineDecorationsWidth: number = this.editor.getLayoutInfo().decorationsWidth;
        //
        // if (this._commentInfos.some(info => Boolean(info.commentingRanges && (Array.isArray(info.commentingRanges) ?
        // info.commentingRanges : info.commentingRanges.ranges).length))) {
        //     if (!this._commentingRangeSpaceReserved) {
        //         this._commentingRangeSpaceReserved = true;
        //         let extraEditorClassName: string[] = [];
        //         const configuredExtraClassName = this.editor.getRawOptions().extraEditorClassName;
        //         if (configuredExtraClassName) {
        //             extraEditorClassName = configuredExtraClassName.split(' ');
        //         }
        //
        //         const options = this.editor.getOptions();
        //         if (options.get(EditorOption.folding)) {
        //             lineDecorationsWidth -= 16;
        //         }
        //         lineDecorationsWidth += 9;
        //         extraEditorClassName.push('inline-comment');
        //         this.editor.updateOptions({
        //             extraEditorClassName: extraEditorClassName.join(' '),
        //             lineDecorationsWidth: lineDecorationsWidth
        //         });
        //
        //         // we only update the lineDecorationsWidth property but keep the width of the whole editor.
        //         const originalLayoutInfo = this.editor.getLayoutInfo();
        //
        //         this.editor.layout({
        //             width: originalLayoutInfo.width,
        //             height: originalLayoutInfo.height
        //         });
        //     }
        // }
        //
        // // create viewzones
        // this.removeCommentWidgetsAndStoreCache();
        //
        // this._commentInfos.forEach(info => {
        //     let providerCacheStore = this._pendingCommentCache[info.owner];
        //     info.threads = info.threads.filter(thread => !thread.isDisposed);
        //     info.threads.forEach(thread => {
        //         let pendingComment: string | null = null;
        //         if (providerCacheStore) {
        //             pendingComment = providerCacheStore[thread.threadId!];
        //         }
        //
        //         if (pendingComment) {
        //             thread.collapsibleState = modes.CommentThreadCollapsibleState.Expanded;
        //         }
        //
        //         this.displayCommentThread(info.owner, thread, pendingComment);
        //     });
        // });
        //
        // this._commentingRangeDecorator.update(this.editor, this._commentInfos);
    }

    get editor(): monaco.editor.IStandaloneCodeEditor | undefined {
        const editor = this.getCurrentEditor();
        if (editor && editor.editor instanceof MonacoDiffEditor) {
            return  editor.editor.diffEditor.getModifiedEditor();
        }
    }

    private displayCommentThread(owner: string, thread: CommentThread, pendingComment: string | undefined): void {
        // const zoneWidget = this.instantiationService.createInstance(ReviewZoneWidget, this.editor, owner, thread, pendingComment);
        if (this.editor) {
            const zoneWidget = new ReviewZoneWidget(this.editor, owner, thread);
            // zoneWidget.display(thread.range.startLineNumber);
            zoneWidget.show({ afterLineNumber: thread.range.startLineNumber, heightInLines: 5 });
            this._commentWidgets.push(zoneWidget);
        }
    }

    private onEditorMouseDown(e: EditorMouseEvent): void {

        if (e.target.element && e.target.element.className.indexOf('comment-diff-added') >= 0) {
            const lineNumber = e.target.position!.line;
            this.addOrToggleCommentAtLine(lineNumber, e);
        }
    }

    public async addOrToggleCommentAtLine(lineNumber: number, e: EditorMouseEvent | undefined): Promise<void> {
        // If an add is already in progress, queue the next add and process it after the current one finishes to
        // prevent empty comment threads from being added to the same line.
        if (!this._addInProgress) {
            this._addInProgress = true;
            // The widget's position is undefined until the widget has been displayed, so rely on the glyph position instead
            const existingCommentsAtLine = this._commentWidgets.filter(widget => widget.getGlyphPosition() === lineNumber);
            if (existingCommentsAtLine.length) {
                // existingCommentsAtLine.forEach(widget => widget.toggleExpand(lineNumber));
                this.processNextThreadToAdd();
                return;
            } else {
                this.addCommentAtLine(lineNumber, e);
            }
        } else {
            this._emptyThreadsToAddQueue.push([lineNumber, e]);
        }
    }

    private processNextThreadToAdd(): void {
        this._addInProgress = false;
        const info = this._emptyThreadsToAddQueue.shift();
        if (info) {
            this.addOrToggleCommentAtLine(info[0], info[1]);
        }
    }

    private getCurrentEditor(): EditorWidget | undefined {
        return  this.editorManager.currentEditor;
    }

    public addCommentAtLine(lineNumber: number, e: EditorMouseEvent | undefined): Promise<void> {
        const newCommentInfos = this.rangeDecorator.getMatchedCommentAction(lineNumber);
        const editor = this.getCurrentEditor();
        if (!editor) {
            return Promise.resolve();
        }
        if (!newCommentInfos.length) {
            return Promise.resolve();
        }

        if (newCommentInfos.length > 1) {
            if (e) {
                // const anchor = { x: e.event.posx, y: e.event.posy };

                // this.contextMenuService.showContextMenu({
                //     getAnchor: () => anchor,
                //     getActions: () => this.getContextMenuActions(newCommentInfos, lineNumber),
                //     getActionsContext: () => newCommentInfos.length ? newCommentInfos[0] : undefined,
                //     onHide: () => { this._addInProgress = false; }
                // });

                return Promise.resolve();
            } else {
                // const picks = this.getCommentProvidersQuickPicks(newCommentInfos);
                // return this.quickInputService.pick(picks, { placeHolder: nls.localize('pickCommentService', "Select Comment Provider"),
                // matchOnDescription: true }).then(pick => {
                //     if (!pick) {
                //         return;
                //     }
                //
                //     const commentInfos = newCommentInfos.filter(info => info.ownerId === pick.id);
                //
                //     if (commentInfos.length) {
                //         const { ownerId } = commentInfos[0];
                //         this.addCommentAtLine2(lineNumber, ownerId);
                //     }
                // }).then(() => {
                //     this._addInProgress = false;
                // });
            }
        } else {
            const { ownerId } = newCommentInfos[0]!;
            this.addCommentAtLine2(lineNumber, ownerId);
        }

        return Promise.resolve();
    }

    public addCommentAtLine2(lineNumber: number, ownerId: string): void {
        const editor = this.getCurrentEditor();
        if (!editor) {
            return;
        }
        // const range = new Range(lineNumber, 1, lineNumber, 1);
        // this.commentService.createCommentThreadTemplate(ownerId, URI.(editor.editor.uri), {
        //     startLineNumber: lineNumber,
        //     endLineNumber: lineNumber,
        //     startColumn: 1,
        //     endColumn: 1
        // });
        // this.processNextThreadToAdd();
        return;
    }
}
