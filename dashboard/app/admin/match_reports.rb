ActiveAdmin.register MatchReport do
  menu parent: "Moderation", priority: 2, label: "Match feedback"
  actions :index, :show

  filter :worked
  filter :created_at

  controller do
    def scoped_collection = super.includes(:user, remote_config: { remote_model: :brand })
  end

  index do
    id_column
    column("Remote") { |r| link_to r.remote_config.remote_model.display_name, admin_remote_config_path(r.remote_config) }
    column :worked
    column("From") { |r| r.user ? r.user.email : "guest #{r.install_id.to_s.first(8)}" }
    column :created_at
  end
end
