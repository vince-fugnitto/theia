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

import {
    Range,
    Comment,
    CommentInput,
    CommentReaction,
    CommentOptions,
    CommentThread,
    CommentThreadChangedEvent
} from '../../../common/plugin-api-rpc-model';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { CommentThreadCollapsibleState } from '../../../plugin/types-impl';
import {
    CommentProviderFeatures,
    CommentsExt,
    CommentsMain,
    CommentThreadChanges,
    MAIN_RPC_CONTEXT
} from '../../../common/plugin-api-rpc';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CommentsService, ICommentInfo } from './comments-service';
import { UriComponents } from '../../../common/uri-components';
import { URI } from 'vscode-uri';
import { CancellationToken } from '@theia/core/lib/common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { interfaces } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { CommentsContribution } from './comments-contribution';

export class CommentThreadImpl implements CommentThread, Disposable {
    private _input?: CommentInput;
    get input(): CommentInput | undefined {
        return this._input;
    }

    set input(value: CommentInput | undefined) {
        this._input = value;
        this._onDidChangeInput.fire(value);
    }

    private readonly _onDidChangeInput = new Emitter<CommentInput | undefined>();
    get onDidChangeInput(): Event<CommentInput | undefined> { return this._onDidChangeInput.event; }

    private _label: string | undefined;

    get label(): string | undefined {
        return this._label;
    }

    set label(label: string | undefined) {
        this._label = label;
        this._onDidChangeLabel.fire(this._label);
    }

    private _contextValue: string | undefined;

    get contextValue(): string | undefined {
        return this._contextValue;
    }

    set contextValue(context: string | undefined) {
        this._contextValue = context;
    }

    private readonly _onDidChangeLabel = new Emitter<string | undefined>();
    readonly onDidChangeLabel: Event<string | undefined> = this._onDidChangeLabel.event;

    private _comments: Comment[] | undefined;

    public get comments(): Comment[] | undefined {
        return this._comments;
    }

    public set comments(newComments: Comment[] | undefined) {
        this._comments = newComments;
        this._onDidChangeComments.fire(this._comments);
    }

    private readonly _onDidChangeComments = new Emitter<Comment[] | undefined>();
    get onDidChangeComments(): Event<Comment[] | undefined> { return this._onDidChangeComments.event; }

    set range(range: Range) {
        this._range = range;
        this._onDidChangeRange.fire(this._range);
    }

    get range(): Range {
        return this._range;
    }

    private readonly _onDidChangeRange = new Emitter<Range>();
    public onDidChangeRange = this._onDidChangeRange.event;

    private _collapsibleState: CommentThreadCollapsibleState | undefined;
    get collapsibleState(): CommentThreadCollapsibleState | undefined {
        return this._collapsibleState;
    }

    set collapsibleState(newState: CommentThreadCollapsibleState | undefined) {
        this._collapsibleState = newState;
        this._onDidChangeCollasibleState.fire(this._collapsibleState);
    }

    private readonly _onDidChangeCollasibleState = new Emitter<CommentThreadCollapsibleState | undefined>();
    public onDidChangeCollasibleState = this._onDidChangeCollasibleState.event;

    private _isDisposed: boolean;

    get isDisposed(): boolean {
        return this._isDisposed;
    }

    constructor(
        public commentThreadHandle: number,
        public controllerHandle: number,
        public extensionId: string,
        public threadId: string,
        public resource: string,
        private _range: Range
    ) {
        this._isDisposed = false;
    }

    batchUpdate(changes: CommentThreadChanges): void {
        const modified = (value: keyof CommentThreadChanges): boolean =>
            Object.prototype.hasOwnProperty.call(changes, value);

        if (modified('range')) { this._range = changes.range!; }
        if (modified('label')) { this._label = changes.label; }
        if (modified('contextValue')) { this._contextValue = changes.contextValue; }
        if (modified('comments')) { this._comments = changes.comments; }
        if (modified('collapseState')) { this._collapsibleState = changes.collapseState; }
    }

    dispose(): void {
        this._isDisposed = true;
        this._onDidChangeCollasibleState.dispose();
        this._onDidChangeComments.dispose();
        this._onDidChangeInput.dispose();
        this._onDidChangeLabel.dispose();
        this._onDidChangeRange.dispose();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toJSON(): any {
        return {
            $mid: 7,
            commentControlHandle: this.controllerHandle,
            commentThreadHandle: this.commentThreadHandle,
        };
    }
}

export class CommentController {
    get handle(): number {
        return this._handle;
    }

    get id(): string {
        return this._id;
    }

    get contextValue(): string {
        return this._id;
    }

    get proxy(): CommentsExt {
        return this._proxy;
    }

    get label(): string {
        return this._label;
    }

    private _reactions: CommentReaction[] | undefined;

    get reactions(): CommentReaction[] | undefined {
        return this._reactions;
    }

    set reactions(reactions: CommentReaction[] | undefined) {
        this._reactions = reactions;
    }

    get options(): CommentOptions | undefined {
        return this._features.options;
    }

    private readonly _threads: Map<number, CommentThreadImpl> = new Map<number, CommentThreadImpl>();
    public activeCommentThread?: CommentThread;

    get features(): CommentProviderFeatures {
        return this._features;
    }

    constructor(
        private readonly _proxy: CommentsExt,
        private readonly _commentService: CommentsService,
        private readonly _handle: number,
        private readonly _uniqueId: string,
        private readonly _id: string,
        private readonly _label: string,
        private _features: CommentProviderFeatures
    ) { }

    updateFeatures(features: CommentProviderFeatures): void {
        this._features = features;
    }

    createCommentThread(extensionId: string,
                        commentThreadHandle: number,
                        threadId: string,
                        resource: UriComponents,
                        range: Range,
    ): CommentThread {
        const thread = new CommentThreadImpl(
            commentThreadHandle,
            this.handle,
            extensionId,
            threadId,
            URI.revive(resource).toString(),
            range
        );

        this._threads.set(commentThreadHandle, thread);

        this._commentService.updateComments(this._uniqueId, {
            added: [thread],
            removed: [],
            changed: []
        });

        return thread;
    }

    updateCommentThread(commentThreadHandle: number,
                        threadId: string,
                        resource: UriComponents,
                        changes: CommentThreadChanges): void {
        const thread = this.getKnownThread(commentThreadHandle);
        thread.batchUpdate(changes);

        this._commentService.updateComments(this._uniqueId, {
            added: [],
            removed: [],
            changed: [thread]
        });
    }

    deleteCommentThread(commentThreadHandle: number): void {
        const thread = this.getKnownThread(commentThreadHandle);
        this._threads.delete(commentThreadHandle);

        this._commentService.updateComments(this._uniqueId, {
            added: [],
            removed: [thread],
            changed: []
        });

        thread.dispose();
    }

    deleteCommentThreadMain(commentThreadId: string): void {
        this._threads.forEach(thread => {
            if (thread.threadId === commentThreadId) {
                this._proxy.$deleteCommentThread(this._handle, thread.commentThreadHandle);
            }
        });
    }

    updateInput(input: string): void {
        const thread = this.activeCommentThread;

        if (thread && thread.input) {
            const commentInput = thread.input;
            commentInput.value = input;
            thread.input = commentInput;
        }
    }

    private getKnownThread(commentThreadHandle: number): CommentThreadImpl {
        const thread = this._threads.get(commentThreadHandle);
        if (!thread) {
            throw new Error('unknown thread');
        }
        return thread;
    }

    async getDocumentComments(resource: URI, token: CancellationToken): Promise<ICommentInfo> {
        const ret: CommentThread[] = [];
        for (const thread of [...this._threads.keys()]) {
            const commentThread = this._threads.get(thread)!;
            if (commentThread.resource === resource.toString()) {
                ret.push(commentThread);
            }
        }

        const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);

        return <ICommentInfo>{
            owner: this._uniqueId,
            label: this.label,
            threads: ret,
            commentingRanges: {
                resource: resource,
                ranges: commentingRanges || []
            }
        };
    }

    async getCommentingRanges(resource: URI, token: CancellationToken): Promise<Range[]> {
        const commentingRanges = await this._proxy.$provideCommentingRanges(this.handle, resource, token);
        return commentingRanges || [];
    }

    async toggleReaction(uri: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction, token: CancellationToken): Promise<void> {
        return this._proxy.$toggleReaction(this._handle, thread.commentThreadHandle, uri, comment, reaction);
    }

    getAllComments(): CommentThread[] {
        const ret: CommentThread[] = [];
        for (const thread of [...this._threads.keys()]) {
            ret.push(this._threads.get(thread)!);
        }

        return ret;
    }

    createCommentThreadTemplate(resource: UriComponents, range: Range): void {
        this._proxy.$createCommentThreadTemplate(this.handle, resource, range);
    }

    async updateCommentThreadTemplate(threadHandle: number, range: Range): Promise<void> {
        await this._proxy.$updateCommentThreadTemplate(this.handle, threadHandle, range);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toJSON(): any {
        return {
            $mid: 6,
            handle: this.handle
        };
    }
}

export class CommentsMainImp implements CommentsMain {
    private readonly _proxy: CommentsExt;
    private _documentProviders = new Map<number, Disposable>();
    private _workspaceProviders = new Map<number, Disposable>();
    private _handlers = new Map<number, string>();
    private _commentControllers = new Map<number, CommentController>();

    private _activeCommentThread?: CommentThread;
    // private readonly _activeCommentThreadDisposables = new DisposableCollection();

    // private _openViewListener: Disposable | null = null;
    private readonly _commentService: CommentsService;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this._proxy = rpc.getProxy(MAIN_RPC_CONTEXT.COMMENTS_EXT);
        container.get(CommentsContribution);
        this._commentService = container.get(CommentsService);
        this._commentService.onDidChangeActiveCommentThread(async thread => {
            const handle = (thread as CommentThread).controllerHandle;
            const controller = this._commentControllers.get(handle);

            if (!controller) {
                return;
            }

            // this._activeCommentThreadDisposables.clear();
            this._activeCommentThread = thread as CommentThread;
            controller.activeCommentThread = this._activeCommentThread;
        });
    }

    $registerCommentController(handle: number, id: string, label: string): void {
        const providerId = uuidv4();
        this._handlers.set(handle, providerId);

        const provider = new CommentController(this._proxy, this._commentService, handle, providerId, id, label, {});
        this._commentService.registerCommentController(providerId, provider);
        this._commentControllers.set(handle, provider);

        // const commentsPanelAlreadyConstructed = !!this._viewDescriptorService.getViewDescriptorById(COMMENTS_VIEW_ID);
        // if (!commentsPanelAlreadyConstructed) {
        //     this.registerView(commentsPanelAlreadyConstructed);
        //     this.registerViewOpenedListener(commentsPanelAlreadyConstructed);
        // }
        this._commentService.setWorkspaceComments(String(handle), []);
    }

    $unregisterCommentController(handle: number): void {
        const providerId = this._handlers.get(handle);
        if (typeof providerId !== 'string') {
            throw new Error('unknown handler');
        }
        this._commentService.unregisterCommentController(providerId);
        this._handlers.delete(handle);
        this._commentControllers.delete(handle);
    }

    $updateCommentControllerFeatures(handle: number, features: CommentProviderFeatures): void {
        const provider = this._commentControllers.get(handle);

        if (!provider) {
            return undefined;
        }

        provider.updateFeatures(features);
    }

    $createCommentThread(handle: number,
                         commentThreadHandle: number,
                         threadId: string,
                         resource: UriComponents,
                         range: Range,
                         extensionId: string
    ): CommentThread | undefined {
        const provider = this._commentControllers.get(handle);

        if (!provider) {
            return undefined;
        }

        return provider.createCommentThread(extensionId, commentThreadHandle, threadId, resource, range);
    }

    $updateCommentThread(handle: number,
                         commentThreadHandle: number,
                         threadId: string,
                         resource: UriComponents,
                         changes: CommentThreadChanges): void {
        const provider = this._commentControllers.get(handle);

        if (!provider) {
            return undefined;
        }

        return provider.updateCommentThread(commentThreadHandle, threadId, resource, changes);
    }

    $deleteCommentThread(handle: number, commentThreadHandle: number): void {
        const provider = this._commentControllers.get(handle);

        if (!provider) {
            return;
        }

        return provider.deleteCommentThread(commentThreadHandle);
    }

    // private registerView(commentsViewAlreadyRegistered: boolean) {
    //     if (!commentsViewAlreadyRegistered) {
    //         const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    //             id: COMMENTS_VIEW_ID,
    //             name: COMMENTS_VIEW_TITLE,
    //             ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [COMMENTS_VIEW_ID,
    //             { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }]),
    //             storageId: COMMENTS_VIEW_TITLE,
    //             hideIfEmpty: true,
    //             icon: Codicon.commentDiscussion.classNames,
    //             order: 10,
    //         }, ViewContainerLocation.Panel);
    //
    //         Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
    //             id: COMMENTS_VIEW_ID,
    //             name: COMMENTS_VIEW_TITLE,
    //             canToggleVisibility: false,
    //             ctorDescriptor: new SyncDescriptor(CommentsPanel),
    //             canMoveView: true,
    //             containerIcon: Codicon.commentDiscussion.classNames,
    //             focusCommand: {
    //                 id: 'workbench.action.focusCommentsPanel'
    //             }
    //         }], VIEW_CONTAINER);
    //     }
    // }
    //
    // /**
    //  * If the comments view has never been opened, the constructor for it has not yet run so it has
    //  * no listeners for comment threads being set or updated. Listen for the view opening for the
    //  * first time and send it comments then.
    //  */
    // private registerViewOpenedListener(commentsPanelAlreadyConstructed: boolean) {
    //     if (!commentsPanelAlreadyConstructed && !this._openViewListener) {
    //         this._openViewListener = this._viewsService.onDidChangeViewVisibility(e => {
    //             if (e.id === COMMENTS_VIEW_ID && e.visible) {
    //                 [...this._commentControllers.keys()].forEach(handle => {
    //                     let threads = this._commentControllers.get(handle)!.getAllComments();
    //
    //                     if (threads.length) {
    //                         const providerId = this.getHandler(handle);
    //                         this._commentService.setWorkspaceComments(providerId, threads);
    //                     }
    //                 });
    //
    //                 if (this._openViewListener) {
    //                     this._openViewListener.dispose();
    //                     this._openViewListener = null;
    //                 }
    //             }
    //         });
    //     }
    // }

    private getHandler(handle: number): string {
        if (!this._handlers.has(handle)) {
            throw new Error('Unknown handler');
        }
        return this._handlers.get(handle)!;
    }

    $onDidCommentThreadsChange(handle: number, event: CommentThreadChangedEvent): void {
        // notify comment service
        const providerId = this.getHandler(handle);
        this._commentService.updateComments(providerId, event);
    }

    dispose(): void {
        // super.dispose();
        this._workspaceProviders.forEach(value => value.dispose());
        this._workspaceProviders.clear();
        this._documentProviders.forEach(value => value.dispose());
        this._documentProviders.clear();
    }
}
