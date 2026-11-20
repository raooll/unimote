# A concrete device model of a brand (e.g. "Samsung AA59-00443A", "Daikin FTKF50").
class RemoteModel < ApplicationRecord
  include PgSearch::Model

  SOURCES = %w[manual flipper_irdb flipper_converted smartir lirc community].freeze

  belongs_to :brand, counter_cache: true
  belongs_to :device_category, counter_cache: true
  has_many :remote_configs, dependent: :destroy

  before_validation { self.slug = name.to_s.parameterize if slug.blank? }

  validates :name, :slug, presence: true
  validates :slug, uniqueness: { scope: %i[brand_id device_category_id] }
  validates :source, inclusion: { in: SOURCES }

  pg_search_scope :search, against: :name, associated_against: { brand: :name },
                  using: { tsearch: { prefix: true }, trigram: { threshold: 0.2 } }

  scope :ordered, -> { order(Arel.sql("lower(remote_models.name)")) }
  # App lists: models that have a non-IR (Wi-Fi / Bluetooth) profile first, since those need no code hunting.
  scope :ordered_for_app, lambda { |categorised_first: false|
    reorder(Arel.sql(
      (categorised_first ? "(device_categories.slug = 'other'), " : "") +
      "(NOT EXISTS (SELECT 1 FROM remote_configs rc WHERE rc.remote_model_id = remote_models.id " \
      "AND rc.status = 'published' AND rc.protocol <> 'ir')), lower(remote_models.name)"
    ))
  }
  scope :with_published, -> { where(id: RemoteConfig.published.select(:remote_model_id)) }

  # Names imported from file names are sometimes just "2" or "Default"; say what they are instead.
  GENERIC_NAME = /\A(\d{1,3}|default|alternate|alt|remote|unknown|generic|new|old|test|tv|common|universal|standard|basic)\z/i

  def label
    return name unless name.to_s.strip.match?(GENERIC_NAME)
    name.strip.match?(/\A\d+\z/) ? "Code set #{name.strip}" : "#{name.strip.titleize} code set"
  end

  # "Samsung AA59", but not "Roku Roku players": the brand is only prefixed when the name does not start with it.
  def display_name
    name.to_s.match?(/\A#{Regexp.escape(brand.name)}\b/i) ? name : "#{brand.name} #{label}"
  end
end
