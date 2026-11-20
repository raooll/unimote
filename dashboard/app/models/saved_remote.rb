class SavedRemote < ApplicationRecord
  belongs_to :user
  belongs_to :room, optional: true
  belongs_to :remote_config, optional: true
  validates :name, :client_uuid, presence: true
  validates :client_uuid, uniqueness: { scope: :user_id }
  validate :room_belongs_to_user

  private

  def room_belongs_to_user
    errors.add(:room, "must belong to you") if room && room.user_id != user_id
  end
end
