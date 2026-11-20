# A remote learned/recorded by a user (guest or logged in), pending admin review.
class ConfigSubmission < ApplicationRecord
  STATUSES = %w[pending approved rejected].freeze

  belongs_to :user, optional: true
  belongs_to :reviewed_by, class_name: "AdminUser", optional: true
  belongs_to :remote_config, optional: true

  enum :status, STATUSES.index_with(&:itself), default: "pending", prefix: true

  validates :brand_name, :model_name_text, :category_slug, presence: true
  validates :protocol, inclusion: { in: RemoteConfig::PROTOCOLS }
  validates :install_id, presence: true, if: -> { user_id.nil? }
  validate :signal_data_valid
  validate :category_exists

  scope :pending, -> { where(status: "pending") }

  private

  def signal_data_valid
    Catalog::SignalSchema.errors_for(self).each { |msg| errors.add(:signal_data, msg) }
  end

  def category_exists
    errors.add(:category_slug, "is not a known category") unless DeviceCategory.exists?(slug: category_slug)
  end
end
