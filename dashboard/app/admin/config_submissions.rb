ActiveAdmin.register ConfigSubmission do
  menu parent: "Moderation", priority: 1, label: "Submissions"
  actions :index, :show, :destroy

  scope :pending, default: true
  scope("Approved") { |s| s.where(status: "approved") }
  scope("Rejected") { |s| s.where(status: "rejected") }
  scope :all

  filter :brand_name
  filter :model_name_text, label: "Model"
  filter :category_slug, label: "Category"
  filter :protocol
  filter :created_at

  controller do
    def scoped_collection = super.includes(:user, :reviewed_by)
  end

  index do
    id_column
    column :brand_name
    column("Model") { |s| s.model_name_text }
    column("Category") { |s| s.category_slug }
    column :protocol
    column("Buttons") { |s| (s.signal_data["commands"] || {}).size }
    column("From") { |s| s.user ? link_to(s.user.email, admin_user_path(s.user)) : "guest #{s.install_id.to_s.first(8)}" }
    column(:status) { |s| status_tag s.status }
    column :created_at
    actions defaults: true do |s|
      if s.status_pending?
        item "Approve", approve_admin_config_submission_path(s), method: :put, class: "member_link"
        item "Reject", reject_admin_config_submission_path(s), method: :put, class: "member_link"
      end
    end
  end

  member_action :approve, method: :put do
    config = Catalog::ApproveSubmission.new(resource, current_admin_user).call
    redirect_to admin_remote_config_path(config), notice: "Approved and published as remote ##{config.id}"
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound, ArgumentError => e
    redirect_to admin_config_submission_path(resource), alert: "Could not approve: #{e.message}"
  end

  member_action :reject, method: :put do
    resource.update!(status: "rejected", reviewed_by: current_admin_user, reviewed_at: Time.current)
    redirect_to admin_config_submissions_path, notice: "Submission rejected"
  end

  action_item :approve, only: :show, if: -> { resource.status_pending? } do
    link_to "Approve & publish", approve_admin_config_submission_path(resource), method: :put
  end
  action_item :reject, only: :show, if: -> { resource.status_pending? } do
    link_to "Reject", reject_admin_config_submission_path(resource), method: :put
  end

  show do
    attributes_table do
      row :id
      row(:status) { |s| status_tag s.status }
      row :brand_name
      row("Model") { |s| s.model_name_text }
      row("Category") { |s| s.category_slug }
      row :protocol
      row :notes
      row("From") { |s| s.user ? link_to(s.user.email, admin_user_path(s.user)) : "guest #{s.install_id}" }
      row :reviewed_by
      row :reviewed_at
      row("Published as") { |s| s.remote_config ? link_to("Remote ##{s.remote_config.id}", admin_remote_config_path(s.remote_config)) : "–" }
      row :created_at
    end
    panel "Commands" do
      table_for (resource.signal_data["commands"] || {}).to_a do
        column("Command") { |name, _| code name }
        column("Frequency") { |_, sig| sig.is_a?(Hash) ? "#{sig['frequency']} Hz" : "–" }
        column("Pulses") { |_, sig| sig.is_a?(Hash) ? Array(sig["pattern"]).size : "–" }
      end
    end
  end
end
