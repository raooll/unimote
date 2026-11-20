class DeviceCategory < ApplicationRecord
  has_many :remote_models, dependent: :restrict_with_error
  has_many :brands, -> { distinct }, through: :remote_models

  validates :slug, :name, presence: true
  validates :slug, uniqueness: true, format: { with: /\A[a-z0-9_]+\z/ }

  scope :active, -> { where(active: true) }
  scope :ordered, -> { order(:position, :name) }
end
