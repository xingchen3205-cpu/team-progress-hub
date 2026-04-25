"use client";

import * as Workspace from "@/components/workspace-context";

export default function DocumentsTab() {
  const {
    documents,
    selectedCategory,
    setSelectedCategory,
    expandedDocs,
    highlightedDocId,
    openDocumentViewMenuId,
    setOpenDocumentViewMenuId,
    currentRole,
    permissions,
    filteredDocuments,
    getMemberName,
    canDeleteDocument,
    canDeleteDocumentVersion,
    getDocumentActionButtons,
    handleDownload,
    handleDocumentViewAction,
    handlePreviewDocument,
    sendDocumentReminder,
    openDocumentModal,
    openVersionUploadModal,
    openReviewModal,
    removeDocument,
    removeDocumentVersion,
  } = Workspace.useWorkspaceContext();

  const {
    BellPlus,
    Check,
    ChevronDown,
    Download,
    Eye,
    FileCheck,
    FolderOpen,
    Trash2,
    Upload,
    documentCategories,
    canTriggerDocumentReminder,
    getDocumentReminderLabel,
    docStatusMeta,
    documentStepLabels,
    getDocumentWorkflowState,
    getDocumentStepCaption,
    SectionHeader,
    EmptyState,
    ActionButton,
  } = Workspace;

const renderDocuments = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          description={
            currentRole === "admin" || currentRole === "school_admin"
              ? "全校项目组资料统一归档，可按分类查看历史版本、下载和审批记录。"
              : "仅展示本项目组资料，可查看历史版本、上传新版本和执行审核。"
          }
          title="资料归档"
        />
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            disabled={!permissions.canUploadDocument}
            onClick={openDocumentModal}
            title="无权限"
            variant="primary"
          >
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>上传文档</span>
            </span>
          </ActionButton>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {documentCategories.map((category) => {
          const count = documents.filter((item) => item.category === category).length;
          const isActive = selectedCategory === category;

          return (
            <button
              key={category}
              className={`document-category-card ${count === 0 ? "empty" : ""} ${
                isActive
                  ? "active"
                  : ""
              }`}
              onClick={() => setSelectedCategory((current) => (current === category ? null : category))}
              type="button"
            >
              <div className="inline-flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-[#1a6fd4]" />
                <h3 className="text-base font-semibold text-slate-900">{category}</h3>
              </div>
              <p className="mt-3 text-2xl font-bold">{count} 份</p>
            </button>
          );
        })}
      </section>

      <section className="space-y-4">
        {filteredDocuments.length > 0 ? (
          filteredDocuments.map((doc) => {
            const statusMeta = docStatusMeta[doc.statusKey ?? "pending"];
            const workflowStates = getDocumentWorkflowState(doc.statusKey ?? "pending");
            const isExpanded = expandedDocs.includes(doc.id);
            const canRemindDocument = canTriggerDocumentReminder({
              actorRole: currentRole,
              statusKey: doc.statusKey ?? "pending",
            });
            const metadataItems = [
              { label: "文档分类", value: doc.category },
              { label: "当前版本", value: doc.currentVersion },
              { label: "上传人", value: doc.ownerName ?? getMemberName(doc.ownerId) },
              { label: "上传时间", value: doc.createdAt ?? "未记录" },
            ];

            return (
              <article
                id={`doc-${doc.id}`}
                key={doc.id}
                className={`group relative rounded-xl border border-white/70 bg-white/82 p-4 shadow-[0_6px_18px_rgba(30,60,120,0.08)] transition ${
                  highlightedDocId === doc.id ? "ring-2 ring-blue-500 ring-offset-2" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3 pr-10">
                  <div className="document-step-compact min-w-0 flex-1">
                    {documentStepLabels.map((label, index) => {
                      const stepState = workflowStates[index];
                      const segmentClassName =
                        index < documentStepLabels.length - 1
                          ? workflowStates[index] === "complete" && workflowStates[index + 1] === "complete"
                            ? "complete"
                            : "pending"
                          : null;

                      return (
                        <div className="document-step-item" key={`${doc.id}-${label}`}>
                          <span className={`document-step-marker ${stepState}`}>
                            {stepState === "complete" ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <span className="truncate text-[12px] font-medium text-slate-700">
                            {label} · {getDocumentStepCaption(stepState)}
                          </span>
                          {segmentClassName ? <span className={`document-step-segment ${segmentClassName}`} /> : null}
                        </div>
                      );
                    })}
                  </div>
                  <span className={`document-status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                </div>

                <div className="mt-3">
                  <h3 className="text-base font-semibold text-slate-900">{doc.name}</h3>
                </div>

                <div className="document-meta-grid mt-3">
                  {metadataItems.map((item) => (
                    <div className="document-meta-item" key={item.label}>
                      <span className="document-meta-label">{item.label}</span>
                      <span className="document-meta-value">{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className="document-comment-panel mt-3">
                  <span className="document-comment-label">批注</span>
                  <p className="document-comment-text">{doc.comment ?? ""}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {getDocumentActionButtons(doc).map((actionButton) => (
                    <ActionButton
                      key={`${doc.id}-${actionButton.key}`}
                      className={
                        actionButton.key === "leaderRevision" || actionButton.key === "teacherRevision"
                          ? "border border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50"
                          : "border border-[#1a6fd4]/28 bg-white text-[#1a6fd4] hover:border-[#1a6fd4]/45 hover:bg-[#1a6fd4]/5"
                      }
                      onClick={() => openReviewModal(doc.id, actionButton.key)}
                      variant="secondary"
                    >
                      <span className="inline-flex items-center gap-2">
                        {actionButton.key === "leaderRevision" || actionButton.key === "teacherRevision" ? null : (
                          <FileCheck className="h-4 w-4" />
                        )}
                        <span>{actionButton.label}</span>
                      </span>
                    </ActionButton>
                  ))}
                  {canRemindDocument ? (
                    <ActionButton
                      className="border border-slate-200 bg-white text-slate-600 hover:border-[#1a6fd4]/35 hover:bg-[#1a6fd4]/5 hover:text-[#1a6fd4]"
                      onClick={() => sendDocumentReminder(doc)}
                      variant="secondary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <BellPlus className="h-4 w-4" />
                        <span>{getDocumentReminderLabel(doc.statusKey ?? "pending")}</span>
                      </span>
                    </ActionButton>
                  ) : null}
                  <button
                    className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-[#1a6fd4]"
                    disabled={!permissions.canUploadDocument}
                    onClick={() => openVersionUploadModal(doc.id)}
                    title={!permissions.canUploadDocument ? "无权限" : undefined}
                    type="button"
                  >
                    <Upload className="h-4 w-4" />
                    <span>上传新版本</span>
                  </button>
                  <div className="relative">
                    <ActionButton
                      disabled={!doc.downloadUrl}
                      onClick={() => setOpenDocumentViewMenuId((current) => (current === doc.id ? null : doc.id))}
                      title={doc.downloadUrl ? undefined : "当前文件尚未生成下载链接"}
                      variant="secondary"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        <span>查看</span>
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </ActionButton>
                    {openDocumentViewMenuId === doc.id ? (
                      <div className="document-view-menu absolute right-0 top-full z-20 mt-2 min-w-[156px] rounded-xl p-1">
                        <button
                          className="document-view-menu-item"
                          onClick={() => handleDocumentViewAction("preview", doc)}
                          type="button"
                        >
                          在线预览
                        </button>
                        <button
                          className="document-view-menu-item"
                          onClick={() => handleDocumentViewAction("download", doc)}
                          type="button"
                        >
                          下载
                        </button>
                        <button
                          className="document-view-menu-item"
                          onClick={() => handleDocumentViewAction("history", doc)}
                          type="button"
                        >
                          {isExpanded ? "历史版本（收起）" : "历史版本"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {canDeleteDocument(doc) ? (
                  <button
                    className="document-card-delete-button"
                    onClick={() => removeDocument(doc.id, doc.name)}
                    title="删除文档"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}

                {isExpanded ? (
                  <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                {doc.versions.map((version) => (
                  <div
                    key={`${doc.id}-${version.version}`}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{version.version}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {version.uploadedAt} · {version.uploader}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {version.fileName || "未记录文件名"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-slate-500">{version.note}</p>
                      <ActionButton
                        onClick={() =>
                          handlePreviewDocument({
                            downloadUrl: version.downloadUrl,
                            fileName: version.fileName,
                            mimeType: version.mimeType,
                          })
                        }
                      >
                        <span className="inline-flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <span>预览版本</span>
                        </span>
                      </ActionButton>
                      <ActionButton
                        disabled={!version.downloadUrl}
                        onClick={() => handleDownload(version.downloadUrl)}
                        title={version.downloadUrl ? undefined : "当前版本尚未生成下载链接"}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          <span>下载版本</span>
                        </span>
                      </ActionButton>
                      <ActionButton
                        disabled={!canDeleteDocumentVersion(doc, version) || doc.versions.length <= 1}
                        onClick={() => removeDocumentVersion(doc.id, version.id)}
                        title={doc.versions.length <= 1 ? "至少保留一个版本" : "无权限"}
                        variant="danger"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          <span>删除版本</span>
                        </span>
                      </ActionButton>
                    </div>
                  </div>
                ))}
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <EmptyState
            description={
              selectedCategory
                ? `当前分类“${selectedCategory}”下还没有文档，可以切换分类或上传新文档。`
                : "当前还没有上传文档，上传后会按分类展示在这里。"
            }
            icon={FolderOpen}
            title="暂无文档"
          />
        )}
      </section>
    </div>
  );

  return renderDocuments();
}
