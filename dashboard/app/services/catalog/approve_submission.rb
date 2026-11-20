module Catalog
  # Turns a pending user submission into a published community remote.
  class ApproveSubmission
    def initialize(submission, admin)
      @sub = submission
      @admin = admin
    end

    def call
      raise ArgumentError, "Submission is not pending" unless @sub.status_pending?

      ActiveRecord::Base.transaction do
        category = DeviceCategory.find_by!(slug: @sub.category_slug)
        brand = Brand.find_or_create_by!(slug: @sub.brand_name.parameterize) { |b| b.name = @sub.brand_name }
        model = RemoteModel.find_or_create_by!(brand: brand, device_category: category, slug: @sub.model_name_text.parameterize) do |m|
          m.name = @sub.model_name_text
          m.source = "community"
        end
        config = RemoteConfig.create!(
          remote_model: model, protocol: @sub.protocol, variant: "community-#{@sub.id}", source: "community",
          external_id: "submission:#{@sub.id}", layout_template: Layouts.for_category(category.slug),
          signal_data: normalized_signal_data, status: "published", popularity: 1
        )
        @sub.update!(status: "approved", reviewed_by: @admin, reviewed_at: Time.current, remote_config: config)
        config
      end
    end

    private

    # Canonical command names so submitted buttons line up with the layouts.
    def normalized_signal_data
      data = @sub.signal_data.deep_dup
      commands = {}
      (data["commands"] || {}).each do |name, signal|
        key = ButtonNames.normalize(name).presence || name.to_s.upcase
        commands[key] ||= signal
      end
      data.merge("commands" => commands)
    end
  end
end
