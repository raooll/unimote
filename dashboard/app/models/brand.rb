class Brand < ApplicationRecord
  include PgSearch::Model

  has_many :remote_models, dependent: :restrict_with_error
  has_many :device_categories, -> { distinct }, through: :remote_models

  before_validation { self.slug = name.to_s.parameterize if slug.blank? }

  validates :name, :slug, presence: true
  validates :slug, uniqueness: true

  pg_search_scope :search, against: :name,
                  using: { tsearch: { prefix: true }, trigram: { threshold: 0.25 } }

  scope :ordered, -> { order(Arel.sql("lower(brands.name)")) }
  scope :with_published_in, lambda { |category|
    where(id: RemoteModel.joins(:remote_configs).merge(RemoteConfig.published)
                         .where(device_category_id: category).select(:brand_id))
  }
end
