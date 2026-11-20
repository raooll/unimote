# A user asked for a brand/model we do not have. Admins see these ranked by demand.
class ModelRequest < ApplicationRecord
  STATUSES = %w[open added declined].freeze
  MAX_REQUESTERS = 1000

  belongs_to :user, optional: true
  enum :status, STATUSES.index_with(&:itself), default: "open", prefix: true

  validates :brand_name, presence: true, length: { maximum: 80 }
  validates :model_name_text, length: { maximum: 120 }
  validates :category_slug, presence: true
  validates :key, presence: true, uniqueness: true
  validates :notes, length: { maximum: 1000 }
  validate :category_exists

  before_validation { self.key = self.class.key_for(brand_name, model_name_text, category_slug) }

  scope :by_demand, -> { order(requests_count: :desc, updated_at: :desc) }

  def self.key_for(brand, model, category)
    [brand, model, category].map { |s| s.to_s.downcase.squish }.join("|")
  end

  # Creates the request, or adds `requester` to an existing identical one. The same requester never counts twice.
  def self.record!(brand_name:, model_name_text:, category_slug:, notes:, requester:, user: nil)
    key = key_for(brand_name, model_name_text, category_slug)
    request = find_by(key: key)
    request ||= create!(brand_name: brand_name.to_s.squish, model_name_text: model_name_text.to_s.squish, category_slug: category_slug,
                        notes: notes, requesters: [requester], user: user)
    unless request.requesters.include?(requester)
      request.requesters = (request.requesters + [requester]).last(MAX_REQUESTERS)
      request.requests_count = request.requesters.size
      request.notes = notes if request.notes.blank? && notes.present?
      request.save!
    end
    request
  rescue ActiveRecord::RecordNotUnique
    retry # two people asked at the same moment; the second pass finds the first one's row
  end

  private

  def category_exists
    errors.add(:category_slug, "is not a known category") unless DeviceCategory.exists?(slug: category_slug)
  end
end
