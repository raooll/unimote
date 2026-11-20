ActiveAdmin.register ModelRequest do
  menu parent: "Moderation", priority: 2, label: "Model requests"
  actions :index, :show, :update, :edit, :destroy
  permit_params :status, :notes

  scope :open, default: true, &:status_open
  scope("Added") { |s| s.where(status: "added") }
  scope("Declined") { |s| s.where(status: "declined") }
  scope :all

  filter :brand_name
  filter :model_name_text, label: "Model"
  filter :category_slug, label: "Category"
  filter :requests_count
  filter :created_at

  config.sort_order = "requests_count_desc"

  index do
    selectable_column
    id_column
    column("People asking", :requests_count, sortable: :requests_count) { |r| status_tag r.requests_count.to_s, class: (r.requests_count >= 5 ? "error" : nil) }
    column :brand_name
    column("Model") { |r| r.model_name_text.presence || "(brand not listed)" }
    column("Category", :category_slug)
    column(:status) { |r| status_tag r.status }
    column :updated_at
    actions
  end

  batch_action :mark_added, confirm: "Mark as added to the catalog?" do |ids|
    batch_action_collection.find(ids).each { |r| r.update!(status: "added") }
    redirect_to collection_path, notice: "#{ids.size} marked as added"
  end

  batch_action :decline, confirm: "Decline these requests?" do |ids|
    batch_action_collection.find(ids).each { |r| r.update!(status: "declined") }
    redirect_to collection_path, notice: "#{ids.size} declined"
  end

  show do
    attributes_table do
      row :brand_name
      row("Model") { |r| r.model_name_text.presence || "(brand not listed)" }
      row :category_slug
      row :requests_count
      row :status
      row :notes
      row :user
      row :created_at
      row :updated_at
    end
  end

  form do |f|
    f.inputs do
      f.input :status, as: :select, collection: ModelRequest::STATUSES, include_blank: false
      f.input :notes
    end
    f.actions
  end
end
