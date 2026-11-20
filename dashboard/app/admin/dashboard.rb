# frozen_string_literal: true

ActiveAdmin.register_page "Dashboard" do
  menu priority: 1, label: proc { I18n.t("active_admin.dashboard") }

  content title: proc { I18n.t("active_admin.dashboard") } do
    now = Time.current
    published = RemoteConfig.published

    columns do
      column do
        panel "Users" do
          attributes_table_for nil do
            row("Total") { User.count }
            row("New (7 days)") { User.where("created_at > ?", now - 7.days).count }
            row("Active (7 days)") { User.where("last_seen_at > ?", now - 7.days).count }
          end
        end
      end
      column do
        panel "Catalog" do
          attributes_table_for nil do
            row("Categories") { DeviceCategory.active.count }
            row("Brands") { Brand.count }
            row("Models") { RemoteModel.count }
            row("Published remotes") { published.count }
            row("Draft / archived") { RemoteConfig.where.not(status: "published").count }
          end
        end
      end
      column do
        panel "Needs your attention" do
          pending = ConfigSubmission.pending.count
          attributes_table_for nil do
            row("Pending submissions") { link_to(pending, admin_config_submissions_path) }
            row("Remotes users say don't work") do
              n = RemoteConfig.where("failure_count > success_count AND failure_count >= 3").count
              link_to n, admin_remote_configs_path(scope: "needs_attention")
            end
          end
        end
        panel "Match wizard (30 days)" do
          reports = MatchReport.where("created_at > ?", now - 30.days)
          total = reports.count
          attributes_table_for nil do
            row("Answers") { total }
            row("Success rate") { total.zero? ? "–" : "#{(100.0 * reports.where(worked: true).count / total).round}%" }
          end
        end
      end
    end

    columns do
      column do
        panel "Published remotes by category" do
          counts = published.joins(:remote_model).group("remote_models.device_category_id").count
          table_for DeviceCategory.ordered.select { |c| counts[c.id].to_i.positive? } do
            column("Category") { |c| link_to c.name, admin_remote_configs_path(q: { remote_model_device_category_id_eq: c.id }) }
            column("Remotes") { |c| counts[c.id] }
          end
        end
      end
      column do
        panel "Top brands" do
          top = RemoteModel.group(:brand_id).order(Arel.sql("count(*) desc")).limit(10).count
          brands = Brand.where(id: top.keys).index_by(&:id)
          table_for top.to_a do
            column("Brand") { |id, _| link_to brands[id].name, admin_brand_path(brands[id]) }
            column("Models") { |_, n| n }
          end
        end
        panel "Most reliable remotes (feedback)" do
          best = published.where("success_count >= 2").order(Arel.sql("success_count::float / (success_count + failure_count) desc, success_count desc")).limit(5)
          if best.empty?
            para "No feedback yet. It appears once users answer the match wizard."
          else
            table_for best.includes(remote_model: :brand) do
              column("Remote") { |c| link_to c.remote_model.display_name, admin_remote_config_path(c) }
              column("Works") { |c| "#{(c.success_rate * 100).round}%" }
            end
          end
        end
      end
    end
  end
end
