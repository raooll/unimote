class Room < ApplicationRecord
  belongs_to :user
  has_many :saved_remotes, dependent: :nullify
  validates :name, :client_uuid, presence: true
  validates :client_uuid, uniqueness: { scope: :user_id }
end
