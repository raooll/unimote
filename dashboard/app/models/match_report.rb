# "Did your device react?" answer from the code-matching wizard. Drives popularity.
class MatchReport < ApplicationRecord
  belongs_to :remote_config
  belongs_to :user, optional: true
  validates :install_id, presence: true, if: -> { user_id.nil? }

  after_create_commit :update_config_stats

  private

  def update_config_stats
    col = worked ? :success_count : :failure_count
    RemoteConfig.where(id: remote_config_id).update_all(
      "#{col} = #{col} + 1, popularity = popularity + #{worked ? 3 : -1}"
    )
  end
end
