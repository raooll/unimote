class Scene < ApplicationRecord
  belongs_to :user
  validates :name, :client_uuid, presence: true
  validates :client_uuid, uniqueness: { scope: :user_id }
  validate :steps_shape

  private

  def steps_shape
    unless steps.is_a?(Array) && steps.all? { |s| s.is_a?(Hash) && s["command"].present? }
      errors.add(:steps, "must be a list of steps, each with a command")
    end
    errors.add(:steps, "is too long (max 50)") if steps.is_a?(Array) && steps.size > 50
  end
end
