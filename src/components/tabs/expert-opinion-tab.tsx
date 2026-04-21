"use client";

import * as Workspace from "@/components/workspace-context";

export default function ExpertOpinionTab() {
  const {
    experts,
    setExpertModalOpen,
    setExpertDraft,
    setExpertFiles,
    setExpertDraftErrors,
    openExpertAttachmentMenuId,
    setOpenExpertAttachmentMenuId,
    permissions,
    handleDownload,
    handlePreviewDocument,
    removeExpert,
  } = Workspace.useWorkspaceContext();

  const {
    CheckCircle2,
    ChevronDown,
    Download,
    MessageSquareText,
    Paperclip,
    Trash2,
    Upload,
    surfaceCardClassName,
    defaultExpertDraft,
    defaultExpertDraftErrors,
    SectionHeader,
    EmptyState,
    ActionButton,
  } = Workspace;

const renderExperts = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description="按时间倒序沉淀每次专家辅导意见与后续落地动作。"
          title="专家意见"
        />
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            disabled={!permissions.canUploadExpert}
            onClick={() => {
              setExpertDraft(defaultExpertDraft);
              setExpertFiles([]);
              setExpertDraftErrors(defaultExpertDraftErrors());
              setExpertModalOpen(true);
            }}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>上传专家意见</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="space-y-4">
        {experts.length > 0 ? (
          experts.map((session) => (
            <article
              key={session.id}
              className={`expert-session-card relative ${surfaceCardClassName}`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600">
                    {session.date} · {session.format}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">
                    {session.expert} · {session.topic}
                  </h3>
                </div>
                <div className="mt-1 flex flex-col items-start gap-3 md:mt-0 md:items-end">
                  {session.attachments.length > 0 ? (
                    <div className="relative">
                      <button
                        className="expert-attachment-trigger"
                        onClick={() =>
                          setOpenExpertAttachmentMenuId((current) => (current === session.id ? null : session.id))
                        }
                        type="button"
                      >
                        <Paperclip className="h-4 w-4" />
                        <span>查看附件</span>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      {openExpertAttachmentMenuId === session.id ? (
                        <div className="document-view-menu absolute right-0 top-full z-20 mt-2 min-w-[260px] rounded-xl p-1">
                          {session.attachments.map((attachment) => (
                            <div className="flex items-center gap-2" key={attachment.id}>
                              <button
                                className="document-view-menu-item min-w-0 flex-1"
                                disabled={!attachment.downloadUrl}
                                onClick={() => {
                                  setOpenExpertAttachmentMenuId(null);
                                  if (attachment.downloadUrl) {
                                    handlePreviewDocument({
                                      downloadUrl: attachment.downloadUrl,
                                      fileName: attachment.fileName,
                                      mimeType: attachment.mimeType,
                                    });
                                  }
                                }}
                                title={attachment.fileName}
                                type="button"
                              >
                                <span className="block truncate">{attachment.fileName}</span>
                              </button>
                              <button
                                className="team-icon-button opacity-100"
                                disabled={!attachment.downloadUrl}
                                onClick={() => {
                                  setOpenExpertAttachmentMenuId(null);
                                  handleDownload(attachment.downloadUrl);
                                }}
                                title="下载附件"
                                type="button"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="expert-detail-row summary">
                  <MessageSquareText className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-400">反馈摘要</p>
                    <p className="mt-1 text-sm leading-7 text-slate-600">{session.summary}</p>
                  </div>
                </div>
                <div className="expert-detail-row action">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-400">落实动作</p>
                    <p className="mt-1 text-sm leading-7 text-slate-600">{session.nextAction}</p>
                  </div>
                </div>
              </div>
              {permissions.canDeleteExpert ? (
                <button
                  className="expert-delete-button"
                  onClick={() => removeExpert(session.id, session.topic)}
                  title="删除意见"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState
            description="专家意见上传后会按时间倒序展示，便于团队持续跟进。"
            icon={MessageSquareText}
            title="暂无专家意见"
          />
        )}
        {permissions.canUploadExpert ? (
          <button
            className="expert-upload-guide"
            onClick={() => {
              setExpertDraft(defaultExpertDraft);
              setExpertFiles([]);
              setExpertDraftErrors(defaultExpertDraftErrors());
              setExpertModalOpen(true);
            }}
            type="button"
          >
            <Upload className="h-5 w-5 text-[#1a6fd4]" />
            <div>
              <p className="text-sm font-medium text-slate-700">上传更多专家意见</p>
              <p className="mt-1 text-xs text-slate-400">继续补充新的专家反馈、附件与落实动作。</p>
            </div>
          </button>
        ) : null}
      </section>
    </div>
  );

  return renderExperts();
}
