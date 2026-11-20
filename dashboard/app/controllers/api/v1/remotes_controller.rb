module Api
  module V1
    class RemotesController < Api::BaseController
      # GET /api/v1/remotes/:id — the full remote the app stores offline.
      # Supports ETag / If-None-Match, so refreshing an up-to-date remote costs a 304.
      def show
        remote = RemoteConfig.published.includes(remote_model: %i[brand device_category]).find(params[:id])
        return unless stale?(etag: [remote.id, remote.version, remote.checksum], last_modified: remote.updated_at, public: true)

        render json: { remote: Api::Resources::Remote.new(remote).to_h }
      end

      # GET /api/v1/remotes/match?category=ac[&brand=daikin][&model=ftkf50][&protocol=ir]
      # Candidate code sets, best first, each with one test signal for the wizard.
      #
      # * Code sets whose test signal is identical are collapsed into one candidate (testing the same signal twice
      #   wastes the user's time). The survivor carries `shared_by`: how many other models use that exact code.
      # * Wi-Fi / Bluetooth profiles come first: they are exact for the device family and need no code hunting.
      # * Uncategorised ("other") remotes of the brand are included but rank after categorised ones, unless the typed model names them.
      # * A code shared by many models ranks higher: it is more likely to be right.
      # * Without `brand` the result is a generic "try common codes" list across all brands (IR only by default).
      GROUP_FETCH = 400

      def match
        category = params.require(:category)
        brand = params[:brand].presence
        protocol = params[:protocol].presence || (brand ? nil : "ir")
        scope = RemoteConfig.published.for_protocol(protocol)
                            .joins(remote_model: %i[brand device_category])
                            .where(device_categories: { slug: Catalog::Categories.slugs_with_other(category) })
                            .includes(remote_model: %i[brand device_category])
        scope = scope.where("brands.slug = :b OR lower(brands.name) = :b", b: brand.to_s.downcase) if brand
        rows = scope.by_popularity.limit(GROUP_FETCH).to_a

        wanted = params[:model].to_s.downcase.presence
        groups = rows.group_by { |c| test_key(c) }.values.map do |members|
          lead = members.max_by { |c| [model_match?(c, wanted) ? 1 : 0, c.popularity, -c.id] }
          { lead: lead, shared: members.size - 1, score: [lead.protocol == "ir" ? 0 : 1, members.any? { |c| model_match?(c, wanted) } ? 1 : 0, members.any? { |c| c.remote_model.device_category.slug != "other" } ? 1 : 0, members.sum(&:popularity), members.size] }
        end
        top = groups.sort_by { |g| g[:score].map(&:-@) }.first(brand ? 12 : 25)
        render json: { candidates: Api::Resources::MatchCandidate.new(top.map { |g| g[:lead] }, params: { shared: top.to_h { |g| [g[:lead].id, g[:shared]] } }).to_h }
      end

      private

      def model_match?(config, wanted)
        wanted.present? && config.remote_model.name.downcase.include?(wanted)
      end

      # Identity of what the wizard would transmit; configs without signals never collapse.
      def test_key(config)
        cmds = config.signal_data["commands"] || {}
        key = %w[POWER POWER_ON POWER_OFF MUTE VOL_UP].find { |k| cmds[k] } || cmds.keys.first
        key ? [config.protocol, key, cmds[key]].hash : "id:#{config.id}"
      end
    end
  end
end
