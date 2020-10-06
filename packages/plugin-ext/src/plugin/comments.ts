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

import * as theia from '@theia/plugin';
import { RPCProtocol } from '../common/rpc-protocol';
import { CommandRegistryImpl } from './command-registry';
import { UriComponents } from '../common/uri-components';
import { URI } from 'vscode-uri';
import {
    CommentReaction,
    Range,
    Comment,
    CommentThreadCollapsibleState as CommentThreadCollapsibleStateModel,
    CommentOptions
} from '../common/plugin-api-rpc-model';
import { DocumentsExtImpl } from './documents';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { fromMarkdown, fromRange, pathOrURIToURI, toRange } from './type-converters';
import { CommentThreadCollapsibleState } from './types-impl';
import {
    CommentsExt,
    CommentsMain,
    CommentThreadChanges,
    Plugin as InternalPlugin,
    PLUGIN_RPC_CONTEXT
} from '../common/plugin-api-rpc';

type ProviderHandle = number;

export class CommentsExtImpl implements CommentsExt {
    private static handlePool = 0;

    private _proxy: CommentsMain;

    private _commentControllers: Map<ProviderHandle, CommentController> = new Map<ProviderHandle, CommentController>();

    private _commentControllersByExtension: Map<string, CommentController[]> = new Map<string, CommentController[]>();

    constructor(readonly rpc: RPCProtocol, readonly commands: CommandRegistryImpl, readonly _documents: DocumentsExtImpl) {
        this._proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.COMMENTS_MAIN);

        commands.registerArgumentProcessor({
            processArgument: arg => {
                if (arg && arg.$mid === 6) {
                    const commentController = this._commentControllers.get(arg.handle);

                    if (!commentController) {
                        return arg;
                    }

                    return commentController;
                } else if (arg && arg.$mid === 7) {
                    const commentController = this._commentControllers.get(arg.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    return commentThread;
                } else if (arg && arg.$mid === 8) {
                    const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    return {
                        thread: commentThread,
                        text: arg.text
                    };
                } else if (arg && arg.$mid === 9) {
                    const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    const commentUniqueId = arg.commentUniqueId;

                    const comment = commentThread.getCommentByUniqueId(commentUniqueId);

                    if (!comment) {
                        return arg;
                    }

                    return comment;

                } else if (arg && arg.$mid === 10) {
                    const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

                    if (!commentController) {
                        return arg;
                    }

                    const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

                    if (!commentThread) {
                        return arg;
                    }

                    const body = arg.text;
                    const commentUniqueId = arg.commentUniqueId;

                    const comment = commentThread.getCommentByUniqueId(commentUniqueId);

                    if (!comment) {
                        return arg;
                    }

                    comment.body = body;
                    return comment;
                }

                return arg;
            }
        });
    }

    createCommentController(plugin: InternalPlugin, id: string, label: string): theia.CommentController {
        const handle = CommentsExtImpl.handlePool++;
        const commentController = new CommentController(plugin.model.id, handle, this._proxy, id, label);
        this._commentControllers.set(commentController.handle, commentController);

        const commentControllers = this._commentControllersByExtension.get(plugin.model.id.toLowerCase()) || [];
        commentControllers.push(commentController);
        this._commentControllersByExtension.set(plugin.model.id.toLowerCase(), commentControllers);

        return commentController;
    }

    $createCommentThreadTemplate(commentControllerHandle: number, uriComponents: UriComponents, range: Range): void {
        const commentController = this._commentControllers.get(commentControllerHandle);

        if (!commentController) {
            return;
        }

        commentController.$createCommentThreadTemplate(uriComponents, range);
    }

    async $updateCommentThreadTemplate(commentControllerHandle: number, threadHandle: number, range: Range): Promise<void> {
        const commentController = this._commentControllers.get(commentControllerHandle);

        if (!commentController) {
            return;
        }

        commentController.$updateCommentThreadTemplate(threadHandle, range);
    }

    async $deleteCommentThread(commentControllerHandle: number, commentThreadHandle: number): Promise<void> {
        const commentController = this._commentControllers.get(commentControllerHandle);

        if (commentController) {
            commentController.$deleteCommentThread(commentThreadHandle);
        }
    }

    async $provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: theia.CancellationToken): Promise<Range[] | undefined> {
        const commentController = this._commentControllers.get(commentControllerHandle);

        if (!commentController || !commentController.commentingRangeProvider) {
            return Promise.resolve(undefined);
        }

        const documentData = this._documents.getDocumentData(URI.revive(uriComponents));
        if (documentData) {
            const ranges: theia.Range[] | undefined = await commentController.commentingRangeProvider!.provideCommentingRanges(documentData.document, token);
            if (ranges) {
                return ranges.map(x => fromRange(x));
            }
        }
    }

    async $toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: Comment, reaction: CommentReaction): Promise<void> {
        const commentController = this._commentControllers.get(commentControllerHandle);

        if (!commentController || !commentController.reactionHandler) {
            return;
        }

        const commentThread = commentController.getCommentThread(threadHandle);
        if (commentThread) {
            const vscodeComment = commentThread.getCommentByUniqueId(comment.uniqueIdInThread);
            if (vscodeComment) {
                if (commentController.reactionHandler) {
                    commentController.reactionHandler(vscodeComment, convertFromReaction(reaction));
                }
            }
        }
    }
}

type CommentThreadModification = Partial<{
    range: theia.Range,
    label: string | undefined,
    contextValue: string | undefined,
    comments: theia.Comment[],
    collapsibleState: theia.CommentThreadCollapsibleState
}>;

export class ExtHostCommentThread implements theia.CommentThread, theia.Disposable {
    private static _handlePool: number = 0;
    readonly handle = ExtHostCommentThread._handlePool++;
    public commentHandle: number = 0;

    private modifications: CommentThreadModification = Object.create(null);

    set threadId(id: string) {
        this._id = id;
    }

    get threadId(): string {
        return this._id!;
    }

    get id(): string {
        return this._id!;
    }

    get resource(): theia.Uri {
        return this._uri;
    }

    get uri(): theia.Uri {
        return this._uri;
    }

    private readonly _onDidUpdateCommentThread = new Emitter<void>();
    readonly onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;

    set range(range: theia.Range) {
        if (!range.isEqual(this._range)) {
            this._range = range;
            this.modifications.range = range;
            this._onDidUpdateCommentThread.fire();
        }
    }

    get range(): theia.Range {
        return this._range;
    }

    private _label: string | undefined;

    get label(): string | undefined {
        return this._label;
    }

    set label(label: string | undefined) {
        this._label = label;
        this.modifications.label = label;
        this._onDidUpdateCommentThread.fire();
    }

    private _contextValue: string | undefined;

    get contextValue(): string | undefined {
        return this._contextValue;
    }

    set contextValue(context: string | undefined) {
        this._contextValue = context;
        this.modifications.contextValue = context;
        this._onDidUpdateCommentThread.fire();
    }

    get comments(): theia.Comment[] {
        return this._comments;
    }

    set comments(newComments: theia.Comment[]) {
        this._comments = newComments;
        this.modifications.comments = newComments;
        this._onDidUpdateCommentThread.fire();
    }

    private _collapseState?: theia.CommentThreadCollapsibleState;

    get collapsibleState(): theia.CommentThreadCollapsibleState {
        return this._collapseState!;
    }

    set collapsibleState(newState: theia.CommentThreadCollapsibleState) {
        this._collapseState = newState;
        this.modifications.collapsibleState = newState;
        this._onDidUpdateCommentThread.fire();
    }

    private _localDisposables: Disposable[];

    private _isDiposed: boolean;

    public get isDisposed(): boolean {
        return this._isDiposed;
    }

    private _commentsMap: Map<theia.Comment, number> = new Map<theia.Comment, number>();

    private _acceptInputDisposables = new DisposableCollection();

    constructor(
        private _proxy: CommentsMain,
        private _commentController: CommentController,
        private _id: string | undefined,
        private _uri: theia.Uri,
        private _range: theia.Range,
        private _comments: theia.Comment[],
        extensionId: string
    ) {
        // this._acceptInputDisposables.value = new DisposableStore();

        if (this._id === undefined) {
            this._id = `${_commentController.id}.${this.handle}`;
        }

        this._proxy.$createCommentThread(
            this._commentController.handle,
            this.handle,
            this._id,
            this._uri,
            fromRange(this._range),
            extensionId
        );

        this._localDisposables = [];
        this._isDiposed = false;

        this._localDisposables.push(this.onDidUpdateCommentThread(() => {
            this.eventuallyUpdateCommentThread();
        }));

        // set up comments after ctor to batch update events.
        this.comments = _comments;
    }

    eventuallyUpdateCommentThread(): void {
        if (this._isDiposed) {
            return;
        }

        // if (!this._acceptInputDisposables.value) {
        //     this._acceptInputDisposables.value = new DisposableStore();
        // }

        const modified = (value: keyof CommentThreadModification): boolean =>
            Object.prototype.hasOwnProperty.call(this.modifications, value);

        const formattedModifications: CommentThreadChanges = {};
        if (modified('range')) {
            formattedModifications.range = fromRange(this._range);
        }
        if (modified('label')) {
            formattedModifications.label = this.label;
        }
        if (modified('contextValue')) {
            formattedModifications.contextValue = this.contextValue;
        }
        if (modified('comments')) {
            formattedModifications.comments =
                this._comments.map(cmt => convertToModeComment(this, this._commentController, cmt, this._commentsMap));
        }
        if (modified('collapsibleState')) {
            formattedModifications.collapseState = convertToCollapsibleState(this._collapseState);
        }
        this.modifications = {};

        this._proxy.$updateCommentThread(
            this._commentController.handle,
            this.handle,
            this._id!,
            this._uri,
            formattedModifications
        );
    }

    getCommentByUniqueId(uniqueId: number): theia.Comment | undefined {
        for (const key of this._commentsMap) {
            const comment = key[0];
            const id = key[1];
            if (uniqueId === id) {
                return comment;
            }
        }

        return;
    }

    dispose(): void {
        this._isDiposed = true;
        this._acceptInputDisposables.dispose();
        this._localDisposables.forEach(disposable => disposable.dispose());
        this._proxy.$deleteCommentThread(
            this._commentController.handle,
            this.handle
        );
    }
}

type ReactionHandler = (comment: theia.Comment, reaction: theia.CommentReaction) => Promise<void>;

class CommentController implements theia.CommentController {
    get id(): string {
        return this._id;
    }

    get label(): string {
        return this._label;
    }

    public get handle(): number {
        return this._handle;
    }

    private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();
    commentingRangeProvider?: theia.CommentingRangeProvider;

    private _reactionHandler?: ReactionHandler;

    get reactionHandler(): ReactionHandler | undefined {
        return this._reactionHandler;
    }

    set reactionHandler(handler: ReactionHandler | undefined) {
        this._reactionHandler = handler;

        this._proxy.$updateCommentControllerFeatures(this.handle, { reactionHandler: !!handler });
    }

    private _options: CommentOptions | undefined;

    get options(): CommentOptions | undefined {
        return this._options;
    }

    set options(options: CommentOptions | undefined) {
        this._options = options;

        this._proxy.$updateCommentControllerFeatures(this.handle, { options: this._options });
    }

    constructor(
        private _extension: string,
        private _handle: number,
        private _proxy: CommentsMain,
        private _id: string,
        private _label: string
    ) {
        this._proxy.$registerCommentController(this.handle, _id, _label);
    }

    createCommentThread(resource: theia.Uri, range: theia.Range, comments: theia.Comment[]): theia.CommentThread;
    createCommentThread(arg0: theia.Uri | string, arg1: theia.Uri | theia.Range, arg2: theia.Range | theia.Comment[], arg3?: theia.Comment[]): theia.CommentThread {
        if (typeof arg0 === 'string') {
            const commentThread = new ExtHostCommentThread(this._proxy, this, arg0, arg1 as theia.Uri, arg2 as theia.Range, arg3 as theia.Comment[], this._extension);
            this._threads.set(commentThread.handle, commentThread);
            return commentThread;
        } else {
            const commentThread = new ExtHostCommentThread(this._proxy, this, undefined, arg0 as theia.Uri, arg1 as theia.Range, arg2 as theia.Comment[], this._extension);
            this._threads.set(commentThread.handle, commentThread);
            return commentThread;
        }
    }

    $createCommentThreadTemplate(uriComponents: UriComponents, range: Range): ExtHostCommentThread {
        const commentThread = new ExtHostCommentThread(this._proxy, this, undefined, URI.revive(uriComponents), toRange(range), [], this._extension);
        commentThread.collapsibleState = CommentThreadCollapsibleStateModel.Expanded;
        this._threads.set(commentThread.handle, commentThread);
        return commentThread;
    }

    $updateCommentThreadTemplate(threadHandle: number, range: Range): void {
        const thread = this._threads.get(threadHandle);
        if (thread) {
            thread.range = toRange(range);
        }
    }

    $deleteCommentThread(threadHandle: number): void {
        const thread = this._threads.get(threadHandle);

        if (thread) {
            thread.dispose();
        }

        this._threads.delete(threadHandle);
    }

    getCommentThread(handle: number): ExtHostCommentThread | undefined {
        return this._threads.get(handle);
    }

    dispose(): void {
        this._threads.forEach(value => {
            value.dispose();
        });

        this._proxy.$unregisterCommentController(this.handle);
    }
}

function convertFromReaction(reaction: CommentReaction): theia.CommentReaction {
    return {
        label: reaction.label || '',
        count: reaction.count || 0,
        iconPath: reaction.iconPath ? URI.revive(reaction.iconPath) : '',
        authorHasReacted: reaction.hasReacted || false
    };
}

function convertToModeComment(thread: ExtHostCommentThread, commentController: CommentController, vscodeComment: theia.Comment, commentsMap: Map<theia.Comment, number>): Comment {
    let commentUniqueId = commentsMap.get(vscodeComment)!;
    if (!commentUniqueId) {
        commentUniqueId = ++thread.commentHandle;
        commentsMap.set(vscodeComment, commentUniqueId);
    }

    const iconPath = vscodeComment.author && vscodeComment.author.iconPath ? vscodeComment.author.iconPath.toString() : undefined;

    return {
        mode: vscodeComment.mode,
        contextValue: vscodeComment.contextValue,
        uniqueIdInThread: commentUniqueId,
        body: fromMarkdown(vscodeComment.body),
        userName: vscodeComment.author.name,
        userIconPath: iconPath,
        label: vscodeComment.label,
        commentReactions: vscodeComment.reactions ? vscodeComment.reactions.map(reaction => convertToReaction(reaction)) : undefined
    };
}

function convertToReaction(reaction: theia.CommentReaction): CommentReaction {
    return {
        label: reaction.label,
        iconPath: reaction.iconPath ? pathOrURIToURI(reaction.iconPath) : undefined,
        count: reaction.count,
        hasReacted: reaction.authorHasReacted,
    };
}

function convertToCollapsibleState(kind: theia.CommentThreadCollapsibleState | undefined): CommentThreadCollapsibleStateModel {
    if (kind !== undefined) {
        switch (kind) {
            case CommentThreadCollapsibleState.Expanded:
                return CommentThreadCollapsibleStateModel.Expanded;
            case CommentThreadCollapsibleState.Collapsed:
                return CommentThreadCollapsibleStateModel.Collapsed;
        }
    }
    return CommentThreadCollapsibleStateModel.Collapsed;
}
