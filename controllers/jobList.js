const ObjectId = require("mongoose").Types.ObjectId;
const JobList = require("../models/jobList");
const { redisClient } = require("../config/redis");
const { clearOneItemCache, clearMultiItemsCache } = require("./redis/clearing");

const getJobListCacheKey = (estoreid) => `jobLists:${estoreid}`;
const getJobListSearchCacheKey = (
  estoreid,
  sortkey,
  sort,
  currentPage,
  pageSize,
  searchQuery,
) =>
  `jobListsSearch:${estoreid}:${sortkey}:${sort}:${currentPage}:${pageSize}:${searchQuery || "all"}`;

const getJobListByIdCacheKey = (estoreid, id) => `jobList:${estoreid}:${id}`;

exports.createJobList = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { code, title, description, price, createdBy } = req.body;

    if (!title || !code) {
      return res.status(400).json({ message: "Title and code are required" });
    }

    const jobList = new JobList({
      code,
      title,
      description,
      price:
        price && typeof price === "object"
          ? price.amount || 0
          : typeof price === "number"
            ? price
            : 0,
      createdBy,
      estoreid,
    });

    const saved = await jobList.save();

    await clearOneItemCache(estoreid, "jobLists");
    await clearMultiItemsCache(estoreid, "jobListsSearch");

    res
      .status(201)
      .json({ message: "Job list created successfully", data: saved });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating job list" + error.message });
  }
};

exports.getAllJobLists = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const cacheKey = getJobListCacheKey(estoreid);

  try {
    const cachedJobLists = await redisClient.get(cacheKey);
    if (cachedJobLists) {
      return res.status(200).json(JSON.parse(cachedJobLists));
    }

    const { search, isActive } = req.query;
    let filter = { estoreid: new ObjectId(estoreid) };

    if (isActive !== undefined) filter.isActive = isActive === "true";

    let query = JobList.find(filter);

    if (search) {
      query = query.find({ $text: { $search: search } });
    }

    const jobLists = await query
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    await redisClient.set(cacheKey, JSON.stringify(jobLists), {
      EX: 86400,
    });

    res.status(200).json(jobLists);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching job lists", error: error.message });
  }
};

exports.getJobListById = async (req, res) => {
  const estoreid = req.headers.estoreid;
  const { id } = req.params;
  const cacheKey = getJobListByIdCacheKey(estoreid, id);

  try {
    const cachedJobList = await redisClient.get(cacheKey);
    if (cachedJobList) {
      return res.status(200).json(JSON.parse(cachedJobList));
    }

    const jobList = await JobList.findOne({
      _id: new ObjectId(id),
      estoreid: new ObjectId(estoreid),
    }).populate("createdBy", "name email");

    if (!jobList) {
      return res.status(404).json({ message: "Job list not found" });
    }

    await redisClient.set(cacheKey, JSON.stringify(jobList), {
      EX: 86400,
    });

    res.status(200).json(jobList);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching job list", error: error.message });
  }
};

exports.updateJobList = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    const updates = req.body;

    // remove any currency value if provided - currency is not stored per-job
    if (updates.price && updates.price.currency) delete updates.price.currency;

    // if price is provided as an object (e.g., { amount }), normalize to number
    if (updates.price && typeof updates.price === "object")
      updates.price = updates.price.amount || 0;

    const jobList = await JobList.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        estoreid: new ObjectId(estoreid),
      },
      updates,
      {
        new: true,
        runValidators: true,
      },
    ).populate("createdBy", "name email");

    if (!jobList) {
      return res.status(404).json({ message: "Job list not found" });
    }

    await clearOneItemCache(estoreid, "jobLists");
    await clearMultiItemsCache(estoreid, "jobListsSearch");
    await redisClient.del(getJobListByIdCacheKey(estoreid, id));

    res.status(200).json(jobList);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating job list", error: error.message });
  }
};

exports.deleteJobList = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { id } = req.params;
    const jobList = await JobList.findOneAndDelete({
      _id: new ObjectId(id),
      estoreid: new ObjectId(estoreid),
    });

    if (!jobList) {
      return res.status(404).json({ message: "Job list not found" });
    }

    await clearOneItemCache(estoreid, "jobLists");
    await clearMultiItemsCache(estoreid, "jobListsSearch");
    await redisClient.del(getJobListByIdCacheKey(estoreid, id));

    res.status(200).json(jobList);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting job list", error: error.message });
  }
};

exports.searchJobList = async (req, res) => {
  const estoreid = req.headers.estoreid;
  try {
    const { sortkey, sort, currentPage, pageSize, searchQuery } = req.body;
    const cacheKey = getJobListSearchCacheKey(
      estoreid,
      sortkey,
      sort,
      currentPage,
      pageSize,
      searchQuery,
    );

    const cachedJobs = await redisClient.get(cacheKey);
    if (cachedJobs) {
      return res.status(200).json(JSON.parse(cachedJobs));
    }

    const searchObj = { estoreid: new ObjectId(estoreid) };

    if (searchQuery) {
      searchObj.$or = [
        { title: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } },
        { code: { $regex: searchQuery, $options: "i" } },
      ];
    }

    let jobs = await JobList.find(searchObj)
      .skip((currentPage - 1) * pageSize)
      .sort({ [sortkey]: sort })
      .limit(pageSize)
      .exec();

    if (jobs.length < 1 && searchQuery) {
      jobs = await JobList.find({
        title: { $regex: searchQuery, $options: "i" },
        estoreid: new ObjectId(estoreid),
      })
        .skip((currentPage - 1) * pageSize)
        .sort({ [sortkey]: sort })
        .limit(pageSize)
        .exec();
    }

    const countJobs = await JobList.countDocuments(searchObj).exec();
    const response = { jobs, count: countJobs };

    await redisClient.set(cacheKey, JSON.stringify(response), {
      EX: 1800,
    });

    res.json(response);
  } catch (error) {
    res.json({ err: "Listing product failed. " + error.message });
  }
};
