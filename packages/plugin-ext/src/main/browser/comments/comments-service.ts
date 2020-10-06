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

import { injectable } from 'inversify';
import { URI } from 'vscode-uri';
import { Event, Emitter } from '@theia/core/lib/common/event';
import {
    Range,
    Comment,
    CommentInfo,
    CommentingRanges, CommentReaction,
    CommentThread,
    CommentThreadChangedEvent, ICommentThreadChangedEvent
} from '../../../common/plugin-api-rpc-model';
import { CommentController } from './comments-main';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

export interface ResourceCommentThreadEvent {
	resource: URI;
	commentInfos: ICommentInfo[];
}

export interface ICommentInfo extends CommentInfo {
	owner: string;
	label?: string;
}

export interface IWorkspaceCommentThreadsEvent {
	ownerId: string;
	commentThreads: CommentThread[];
}
export const CommentsService = Symbol('CommentsService');
export interface CommentsService {
	readonly _serviceBrand: undefined;
	readonly onDidSetResourceCommentInfos: Event<ResourceCommentThreadEvent>;
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent>;
	readonly onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent>;
	readonly onDidChangeActiveCommentThread: Event<CommentThread | null>;
	readonly onDidChangeActiveCommentingRange: Event<{ range: Range, commentingRangesInfo: CommentingRanges }>;
	readonly onDidSetDataProvider: Event<void>;
	readonly onDidDeleteDataProvider: Event<string>;
	setDocumentComments(resource: URI, commentInfos: ICommentInfo[]): void;
	setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void;
	removeWorkspaceComments(owner: string): void;
	registerCommentController(owner: string, commentControl: CommentController): void;
	unregisterCommentController(owner: string): void;
	getCommentController(owner: string): CommentController | undefined;
	createCommentThreadTemplate(owner: string, resource: URI, range: Range): void;
	updateCommentThreadTemplate(owner: string, threadHandle: number, range: Range): Promise<void>;
	// getCommentMenus(owner: string): CommentMenus;
	updateComments(ownerId: string, event: CommentThreadChangedEvent): void;
	disposeCommentThread(ownerId: string, threadId: string): void;
	getComments(resource: URI): Promise<(ICommentInfo | null)[]>;
	getCommentingRanges(resource: URI): Promise<Range[]>;
	hasReactionHandler(owner: string): boolean;
	toggleReaction(owner: string, resource: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction): Promise<void>;
	setActiveCommentThread(commentThread: CommentThread | null): void;
}

@injectable()
export class PluginCommentService implements CommentsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSetDataProvider: Emitter<void> = new Emitter<void>();
	readonly onDidSetDataProvider: Event<void> = this._onDidSetDataProvider.event;

	private readonly _onDidDeleteDataProvider: Emitter<string> = new Emitter<string>();
	readonly onDidDeleteDataProvider: Event<string> = this._onDidDeleteDataProvider.event;

	private readonly _onDidSetResourceCommentInfos: Emitter<ResourceCommentThreadEvent> = new Emitter<ResourceCommentThreadEvent>();
	readonly onDidSetResourceCommentInfos: Event<ResourceCommentThreadEvent> = this._onDidSetResourceCommentInfos.event;

	private readonly _onDidSetAllCommentThreads: Emitter<IWorkspaceCommentThreadsEvent> = new Emitter<IWorkspaceCommentThreadsEvent>();
	readonly onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent> = this._onDidSetAllCommentThreads.event;

	private readonly _onDidUpdateCommentThreads: Emitter<ICommentThreadChangedEvent> = new Emitter<ICommentThreadChangedEvent>();
	readonly onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent> = this._onDidUpdateCommentThreads.event;

	private readonly _onDidChangeActiveCommentThread = new Emitter<CommentThread | null>();
	readonly onDidChangeActiveCommentThread = this._onDidChangeActiveCommentThread.event;

	private readonly _onDidChangeActiveCommentingRange: Emitter<{
		range: Range, commentingRangesInfo:
		CommentingRanges
	}> = new Emitter<{
		range: Range, commentingRangesInfo:
		CommentingRanges
	}>();
	readonly onDidChangeActiveCommentingRange: Event<{ range: Range, commentingRangesInfo: CommentingRanges }> = this._onDidChangeActiveCommentingRange.event;

	private _commentControls = new Map<string, CommentController>();
	// private _commentMenus = new Map<string, CommentMenus>();

	constructor(
		// @IInstantiationService protected instantiationService: IInstantiationService
	) {
		// super();
	}

	setActiveCommentThread(commentThread: CommentThread | null): void {
		this._onDidChangeActiveCommentThread.fire(commentThread);
	}

	setDocumentComments(resource: URI, commentInfos: ICommentInfo[]): void {
		this._onDidSetResourceCommentInfos.fire({ resource, commentInfos });
	}

	setWorkspaceComments(owner: string, commentsByResource: CommentThread[]): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: commentsByResource });
	}

	removeWorkspaceComments(owner: string): void {
		this._onDidSetAllCommentThreads.fire({ ownerId: owner, commentThreads: [] });
	}

	registerCommentController(owner: string, commentControl: CommentController): void {
		this._commentControls.set(owner, commentControl);
		this._onDidSetDataProvider.fire();
	}

	unregisterCommentController(owner: string): void {
		this._commentControls.delete(owner);
		this._onDidDeleteDataProvider.fire(owner);
	}

	getCommentController(owner: string): CommentController | undefined {
		return this._commentControls.get(owner);
	}

	createCommentThreadTemplate(owner: string, resource: URI, range: Range): void {
		const commentController = this._commentControls.get(owner);

		if (!commentController) {
			return;
		}

		commentController.createCommentThreadTemplate(resource, range);
	}

	async updateCommentThreadTemplate(owner: string, threadHandle: number, range: Range): Promise<void> {
		const commentController = this._commentControls.get(owner);

		if (!commentController) {
			return;
		}

		await commentController.updateCommentThreadTemplate(threadHandle, range);
	}

	disposeCommentThread(owner: string, threadId: string): void {
		const controller = this.getCommentController(owner);
		if (controller) {
			controller.deleteCommentThreadMain(threadId);
		}
	}

	// getCommentMenus(owner: string): CommentMenus {
	// 	if (this._commentMenus.get(owner)) {
	// 		return this._commentMenus.get(owner)!;
	// 	}
    //
	// 	let menu = this.instantiationService.createInstance(CommentMenus);
	// 	this._commentMenus.set(owner, menu);
	// 	return menu;
	// }

	updateComments(ownerId: string, event: CommentThreadChangedEvent): void {
		const evt: ICommentThreadChangedEvent = Object.assign({}, event, { owner: ownerId });
		this._onDidUpdateCommentThreads.fire(evt);
	}

	async toggleReaction(owner: string, resource: URI, thread: CommentThread, comment: Comment, reaction: CommentReaction): Promise<void> {
		const commentController = this._commentControls.get(owner);

		if (commentController) {
			return commentController.toggleReaction(resource, thread, comment, reaction, CancellationToken.None);
		} else {
			throw new Error('Not supported');
		}
	}

	hasReactionHandler(owner: string): boolean {
		const commentProvider = this._commentControls.get(owner);

		if (commentProvider) {
			return !!commentProvider.features.reactionHandler;
		}

		return false;
	}

	async getComments(resource: URI): Promise<(ICommentInfo | null)[]> {
		const commentControlResult: Promise<ICommentInfo | null>[] = [];

		this._commentControls.forEach(control => {
			commentControlResult.push(control.getDocumentComments(resource, CancellationToken.None)
				.catch(e => {
					console.log(e);
					return null;
				}));
		});

		return Promise.all(commentControlResult);
	}

	async getCommentingRanges(resource: URI): Promise<Range[]> {
		const commentControlResult: Promise<Range[]>[] = [];

		this._commentControls.forEach(control => {
			commentControlResult.push(control.getCommentingRanges(resource, CancellationToken.None));
		});

		const ret = await Promise.all(commentControlResult);
		return ret.reduce((prev, curr) => { prev.push(...curr); return prev; }, []);
	}
}
